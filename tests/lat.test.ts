import { describe, it, expect } from "vitest";
import { parseLatAnnotations } from "../src/analysis/lat.js";

describe("parseLatAnnotations", () => {
  describe("HTML comment annotations", () => {
    it("parses @lat:refs with single target", () => {
      const content = "# CLAUDE.md\n\n<!-- @lat:refs auth-patterns.md -->";
      const refs = parseLatAnnotations("CLAUDE.md", content);

      expect(refs).toHaveLength(1);
      expect(refs[0].source).toBe("CLAUDE.md");
      expect(refs[0].target).toBe("auth-patterns.md");
      expect(refs[0].target_type).toBe("instruction");
      expect(refs[0].reference_type).toBe("lat_annotation");
      expect(refs[0].confidence).toBe(1.0);
      expect(refs[0].category).toBe("structural");
    });

    it("parses @lat:refs with multiple targets", () => {
      const content = "<!-- @lat:refs foo.md, bar.md, baz.md -->";
      const refs = parseLatAnnotations("CLAUDE.md", content);

      expect(refs).toHaveLength(3);
      expect(refs.map((r) => r.target)).toEqual(["foo.md", "bar.md", "baz.md"]);
    });

    it("parses @lat:uses-mcp", () => {
      const content = "<!-- @lat:uses-mcp github, filesystem -->";
      const refs = parseLatAnnotations("CLAUDE.md", content);

      expect(refs).toHaveLength(2);
      expect(refs[0].target).toBe("mcp:github");
      expect(refs[0].target_type).toBe("mcp");
      expect(refs[1].target).toBe("mcp:filesystem");
      expect(refs[1].target_type).toBe("mcp");
    });

    it("parses @lat:uses-skill", () => {
      const content = "<!-- @lat:uses-skill deploy, code-review -->";
      const refs = parseLatAnnotations("CLAUDE.md", content);

      expect(refs).toHaveLength(2);
      expect(refs[0].target).toBe("skill:deploy");
      expect(refs[0].target_type).toBe("skill");
      expect(refs[1].target).toBe("skill:code-review");
    });

    it("ignores metadata annotations", () => {
      const content = "<!-- @lat:platform claude-code -->\n<!-- @lat:deprecated -->";
      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(0);
    });

    it("handles multiple annotations in one file", () => {
      const content = [
        "<!-- @lat:refs auth.md -->",
        "Some content here.",
        "<!-- @lat:uses-mcp github -->",
        "More content.",
        "<!-- @lat:uses-skill deploy -->",
      ].join("\n");

      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(3);
      expect(refs.map((r) => r.reference_type)).toEqual([
        "lat_annotation",
        "lat_annotation",
        "lat_annotation",
      ]);
    });
  });

  describe("YAML front-matter annotations", () => {
    it("parses lat.refs from front-matter", () => {
      const content = [
        "---",
        "lat:",
        "  refs:",
        "    - auth-patterns.md",
        "    - error-handling.md",
        "---",
        "# CLAUDE.md",
      ].join("\n");

      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(2);
      expect(refs[0].target).toBe("auth-patterns.md");
      expect(refs[1].target).toBe("error-handling.md");
    });

    it("parses lat.uses-mcp from front-matter", () => {
      const content = [
        "---",
        "lat:",
        "  uses-mcp:",
        "    - github",
        "---",
        "# Content",
      ].join("\n");

      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(1);
      expect(refs[0].target).toBe("mcp:github");
      expect(refs[0].target_type).toBe("mcp");
    });

    it("parses lat.uses-skill from front-matter", () => {
      const content = [
        "---",
        "lat:",
        "  uses-skill:",
        "    - deploy",
        "---",
        "# Content",
      ].join("\n");

      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(1);
      expect(refs[0].target).toBe("skill:deploy");
    });

    it("handles invalid YAML gracefully", () => {
      const content = "---\n{invalid yaml: [[\n---\n# Content";
      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(0);
    });

    it("handles missing lat key gracefully", () => {
      const content = "---\ntitle: My Doc\n---\n# Content";
      const refs = parseLatAnnotations("CLAUDE.md", content);
      expect(refs).toHaveLength(0);
    });
  });

  it("returns empty for content with no annotations", () => {
    const content = "# CLAUDE.md\n\nJust regular markdown content.";
    const refs = parseLatAnnotations("CLAUDE.md", content);
    expect(refs).toHaveLength(0);
  });

  it("combines HTML and YAML annotations", () => {
    const content = [
      "---",
      "lat:",
      "  refs:",
      "    - from-yaml.md",
      "---",
      "# Content",
      "<!-- @lat:uses-mcp github -->",
    ].join("\n");

    const refs = parseLatAnnotations("CLAUDE.md", content);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.target).sort()).toEqual(["from-yaml.md", "mcp:github"]);
  });
});
