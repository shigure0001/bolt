/**
 * Web Fetch Special Handlers Index
 *
 * Builds the specialHandler list for site-specific content extraction.
 */
import { handleArxiv } from "./arxiv";
import { handleCisaKev } from "./cisa-kev";
import { handleClojars } from "./clojars";
import { handleCratesIo } from "./crates-io";
import { handleDockerHub } from "./dockerhub";
import { handleDocsRs } from "./docs-rs";
import { handleGitHub } from "./github";
import { handleGitHubGist } from "./github-gist";
import { handleGitLab } from "./gitlab";
import { handleGoPkg } from "./go-pkg";
import { handleHackage } from "./hackage";
import { handleHex } from "./hex";
import { handleHuggingFace } from "./huggingface";
import { handleMaven } from "./maven";
import { handleMDN } from "./mdn";
import { handleMetaCPAN } from "./metacpan";
import { handleNpm } from "./npm";
import { handleNuGet } from "./nuget";
import { handleNvd } from "./nvd";
import { handleOsv } from "./osv";
import { handlePackagist } from "./packagist";
import { handlePubDev } from "./pub-dev";
import { handlePyPI } from "./pypi";
import { handleReadTheDocs } from "./readthedocs";
import { handleRfc } from "./rfc";
import { handleRubyGems } from "./rubygems";
import { handleStackOverflow } from "./stackoverflow";
import { handleTerraform } from "./terraform";
import type { SpecialHandler } from "./types";
import { handleW3c } from "./w3c";
import { handleWikipedia } from "./wikipedia";

export const specialHandlers: SpecialHandler[] = [
	// Git hosting
	handleGitHubGist,
	handleGitHub,
	handleGitLab,
	// Developer content
	handleStackOverflow,
	handleMDN,
	handleDocsRs,
	handleReadTheDocs,
	// Package registries
	handleNpm,
	handleNuGet,
	handleClojars,
	handlePyPI,
	handleCratesIo,
	handleDockerHub,
	handleGoPkg,
	handleHex,
	handlePackagist,
	handlePubDev,
	handleMaven,
	handleRubyGems,
	handleTerraform,
	handleHackage,
	handleMetaCPAN,
	// ML/AI
	handleHuggingFace,
	// Academic
	handleArxiv,
	handleRfc,
	// Security
	handleCisaKev,
	handleNvd,
	handleOsv,
	// Reference
	handleW3c,
	handleWikipedia,
];
