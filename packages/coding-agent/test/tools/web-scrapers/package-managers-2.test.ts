import { describe, expect, it } from "bun:test";
import { handleDockerHub } from "@oh-my-pi/pi-coding-agent/web/scrapers/dockerhub";
import { handleHackage } from "@oh-my-pi/pi-coding-agent/web/scrapers/hackage";
import { handleMetaCPAN } from "@oh-my-pi/pi-coding-agent/web/scrapers/metacpan";
import { handleTerraform } from "@oh-my-pi/pi-coding-agent/web/scrapers/terraform";

const SKIP = !Bun.env.WEB_FETCH_INTEGRATION;

describe.skipIf(SKIP)("handleMetaCPAN", () => {
	it("returns null for non-MetaCPAN URLs", async () => {
		const result = await handleMetaCPAN("https://example.com", 20);
		expect(result).toBeNull();
	});

	it("returns null for non-matching MetaCPAN paths", async () => {
		const result = await handleMetaCPAN("https://metacpan.org/about", 20);
		expect(result).toBeNull();
	});

	it("fetches Moose module", async () => {
		const result = await handleMetaCPAN("https://metacpan.org/pod/Moose", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("metacpan");
		expect(result?.content).toContain("Moose");
		expect(result?.contentType).toBe("text/markdown");
	});

	it("fetches release by distribution name", async () => {
		const result = await handleMetaCPAN("https://metacpan.org/release/Moose", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("metacpan");
		expect(result?.content).toContain("Moose");
	});
});

describe.skipIf(SKIP)("handleHackage", () => {
	it("returns null for non-Hackage URLs", async () => {
		const result = await handleHackage("https://example.com", 20);
		expect(result).toBeNull();
	});

	it("returns null for non-package Hackage paths", async () => {
		const result = await handleHackage("https://hackage.haskell.org/", 20);
		expect(result).toBeNull();
	});

	it("fetches aeson package", async () => {
		const result = await handleHackage("https://hackage.haskell.org/package/aeson", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("hackage");
		expect(result?.content).toContain("aeson");
		expect(result?.content).toContain("JSON");
		expect(result?.contentType).toBe("text/markdown");
	}, 20000);
});

describe.skipIf(SKIP)("handleDockerHub", () => {
	it("returns null for non-DockerHub URLs", async () => {
		const result = await handleDockerHub("https://example.com", 20);
		expect(result).toBeNull();
	});

	it("returns null for non-matching DockerHub paths", async () => {
		const result = await handleDockerHub("https://hub.docker.com/search", 20);
		expect(result).toBeNull();
	});

	it("fetches official nginx image", async () => {
		const result = await handleDockerHub("https://hub.docker.com/_/nginx", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("dockerhub");
		expect(result?.content).toContain("nginx");
		expect(result?.content).toContain("docker pull");
		expect(result?.contentType).toBe("text/markdown");
	});

	it("fetches grafana/grafana image", async () => {
		const result = await handleDockerHub("https://hub.docker.com/r/grafana/grafana", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("dockerhub");
		expect(result?.content).toContain("grafana");
		expect(result?.content).toContain("docker pull");
	});
});

describe.skipIf(SKIP)("handleTerraform", () => {
	it("returns null for non-Terraform URLs", async () => {
		const result = await handleTerraform("https://example.com", 20);
		expect(result).toBeNull();
	});

	it("returns null for non-matching Terraform paths", async () => {
		const result = await handleTerraform("https://registry.terraform.io/", 20);
		expect(result).toBeNull();
	});

	it("fetches hashicorp/aws provider", async () => {
		const result = await handleTerraform("https://registry.terraform.io/providers/hashicorp/aws", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("terraform");
		expect(result?.content).toContain("aws");
		expect(result?.content).toContain("hashicorp");
		expect(result?.content).toContain("required_providers");
		expect(result?.contentType).toBe("text/markdown");
	});

	it("fetches terraform-aws-modules/vpc/aws module", async () => {
		const result = await handleTerraform("https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("terraform");
		expect(result?.content).toContain("vpc");
		expect(result?.content).toContain("terraform-aws-modules");
		expect(result?.content).toContain("module");
	});
});
