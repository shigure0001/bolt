mod common;

use common::{DiskWriter, Workspace, run_fixture};
use pi_edit::{EditMode, ModeEngine, modes::replace::ReplaceEngine, stream_json::ArgSnapshot};
use serde_json::json;

#[tokio::test]
async fn replace_core_fixtures() {
	run_fixture("replace/core.json", EditMode::Replace).await;
}

#[tokio::test]
async fn replace_old_text_new_text_and_rendered_preview() {
	let workspace = Workspace::new(EditMode::Replace);
	let original = "line one\nline two\nline three\n";
	workspace.write("bar.txt", original);
	let outcome = workspace
		.apply_json(
			&json!({ "path": "bar.txt", "old_string": "line two", "new_string": "line TWO" }),
			&DiskWriter::default(),
		)
		.await
		.unwrap();
	let file = &outcome.files[0];
	assert_eq!(file.absolute, workspace.cwd().join("bar.txt"));
	assert_eq!(file.old_text.as_deref(), Some(original));
	assert_eq!(file.new_text.as_deref(), Some("line one\nline TWO\nline three\n"));
	assert!(
		file
			.text
			.contains("[bar.txt]\n1|line one\n2|line TWO\n3|line three")
	);
	assert!(!file.text.starts_with("[bar.txt#"));
}

#[tokio::test]
async fn duplicate_match_error_lists_lines_and_marks_previews() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write(
		"t.py",
		"def a():\n    return 1\n\ndef b():\n    return 1\n\ndef c(x):\n    if x:\n        return 2\n",
	);
	let error = workspace
		.apply_json(
			&json!({ "path": "t.py", "old_string": "    return 1", "new_string": "    return 3" }),
			&DiskWriter::default(),
		)
		.await
		.unwrap_err()
		.to_string();
	assert!(error.contains("Found 2 occurrences in t.py (lines 2, 5);"), "{error}");
	assert!(error.contains("*2|    return 1") && error.contains("*5|    return 1"), "{error}");
	assert_eq!(error.matches("def a():").count(), 1, "previews must not overlap: {error}");
}

#[tokio::test]
async fn fuzzy_only_match_is_reported_in_result_text() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write("f.py", "def a():\n    pass\n\nclass K:\n    def m(self):\n        return 1\n");
	let fuzzy = workspace
		.apply_json(
			&json!({
				"path": "f.py",
				"old_string": "def m(self):\n    return 1",
				"new_string": "def m(self):\n    return 2",
			}),
			&DiskWriter::default(),
		)
		.await
		.unwrap();
	assert!(fuzzy.files[0].text.contains("matched with whitespace-insensitive fallback at line 5"));
	let exact = workspace
		.apply_json(
			&json!({ "path": "f.py", "old_string": "return 2", "new_string": "return 3" }),
			&DiskWriter::default(),
		)
		.await
		.unwrap();
	assert!(!exact.files[0].text.contains("fallback"));
}

#[tokio::test]
async fn prunes_old_text_new_text_while_keeping_diff() {
	let workspace = Workspace::new(EditMode::Replace);
	let filler = "filler line that makes the source large\n".repeat(500);
	workspace.write("big.txt", &format!("{filler}LINE A\n{filler}"));
	let outcome = workspace
		.apply_json(
			&json!({ "path": "big.txt", "old_string": "LINE A", "new_string": "LINE B" }),
			&DiskWriter::default(),
		)
		.await
		.unwrap();
	let file = &outcome.files[0];
	assert_eq!(file.absolute, workspace.cwd().join("big.txt"));
	assert!(file.snapshots_pruned);
	assert!(file.old_text.is_none());
	assert!(file.new_text.is_none());
	assert!(file.diff.contains("+501|LINE B"));
}

#[tokio::test]
async fn applies_cursor_batch_sequentially_with_one_aggregate_diff() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write("a.ts", "one\ntwo\nthree\n");
	let outcome = workspace
		.apply_json(
			&json!({
				"path": "a.ts",
				"edits": [
					{ "old_string": "one", "new_string": "ONE" },
					{ "old_string": "two", "new_string": "TWO" }
				]
			}),
			&DiskWriter::default(),
		)
		.await
		.unwrap();
	assert_eq!(workspace.read("a.ts").as_deref(), Some("ONE\nTWO\nthree\n"));
	assert_eq!(outcome.files.len(), 1);
	assert!(outcome.files[0].diff.contains("-1|one"));
	assert!(outcome.files[0].diff.contains("+1|ONE"));
	assert!(outcome.files[0].diff.contains("-2|two"));
	assert!(outcome.files[0].diff.contains("+2|TWO"));
}

#[tokio::test]
async fn replace_all_marks_the_gap_between_distant_hunks() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write(
		"a.ts",
		"export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function sub(a: number, b: number): number {\n  return a - b;\n}\n\n// TODO: mul\nconst x = add(1, 2);\nconst y = add(3, 4);\nconsole.log(x, y);\n",
	);
	let outcome = workspace
		.apply_json(
			&json!({ "path": "a.ts", "old_string": "add(", "new_string": "plus(", "replace_all": true }),
			&DiskWriter::default(),
		)
		.await
		.unwrap();
	let text = &outcome.text;
	let rows: Vec<&str> = text.lines().filter(|row| row.contains('|') || *row == "…").collect();
	for pair in rows.windows(2) {
		let number = |row: &str| row.trim_start_matches(['>', ' ', '+', '-', '*']).split('|').next()?.parse::<u32>().ok();
		if let (Some(a), Some(b)) = (number(pair[0]), number(pair[1])) {
			assert!(b <= a + 1, "rows {a} and {b} are not adjacent and have no `…` between them:\n{text}");
		}
	}
}

#[tokio::test]
async fn cursor_batch_failure_stages_nothing() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write("a.ts", "one\ntwo\n");
	let writer = DiskWriter::default();
	let error = workspace
		.apply_json(
			&json!({
				"path": "a.ts",
				"edits": [
					{ "old_string": "one", "new_string": "ONE" },
					{ "old_string": "missing", "new_string": "MISSING" }
				]
			}),
			&writer,
		)
		.await
		.unwrap_err();
	assert!(error.to_string().contains("a.ts"));
	assert!(writer.requests.lock().is_empty());
	assert_eq!(workspace.read("a.ts").as_deref(), Some("one\ntwo\n"));
}

#[test]
fn replace_matcher_entries_use_top_level_path_and_new_string() {
	let engine = ReplaceEngine { allow_fuzzy: true, fuzzy_threshold: 0.95 };
	let snapshot = ArgSnapshot {
		path: Some("src/foo.ts".into()),
		new_string: Some("x = 1".into()),
		..ArgSnapshot::default()
	};
	assert_eq!(engine.inspect(&snapshot).paths, vec!["src/foo.ts"]);
	assert_eq!(engine.inspect(&snapshot).entries, vec![("src/foo.ts".into(), "x = 1".into())]);
}

#[test]
fn replace_matcher_omits_incomplete_entries() {
	let engine = ReplaceEngine { allow_fuzzy: true, fuzzy_threshold: 0.95 };
	let snapshot = ArgSnapshot { path: Some("src/foo.ts".into()), ..ArgSnapshot::default() };
	assert_eq!(engine.inspect(&snapshot).paths, vec!["src/foo.ts"]);
	assert!(engine.inspect(&snapshot).entries.is_empty());
}

#[test]
fn streaming_preview_waits_until_new_string_is_present() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write("a.txt", "alpha\n");
	let mut session = workspace.session();
	session.push(r#"{"path":"a.txt","old_string":"alp"#);
	assert!(session.preview().files.is_empty());
	session.push(r#"ha","new_string":"beta"}"#);
	let preview = session.preview();
	assert_eq!(preview.files.len(), 1);
	assert!(
		preview.files[0]
			.diff
			.as_deref()
			.is_some_and(|diff| diff.contains("+1|beta"))
	);
}

#[test]
fn preview_uses_compute_edit_diff_error_strings() {
	let workspace = Workspace::new(EditMode::Replace);
	workspace.write("a.txt", "alpha\n");
	let mut empty = workspace.session();
	empty.push(r#"{"path":"a.txt","old_string":"","new_string":"beta"}"#);
	assert_eq!(empty.preview().files[0].error.as_deref(), Some("oldText must not be empty."));
}
