import { describe, it, expect } from "vitest";
import { IMAGE_LIMITS, checkImageFile, fitWithin } from "./imageUpload";

describe("fitWithin", () => {
  it("keeps small images as they are", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("scales the longer side down to the limit, keeping the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 5000, 1600)).toEqual({ width: 320, height: 1600 });
  });
});

describe("checkImageFile", () => {
  const file = (type: string, size: number) => ({ type, size }) as File;
  it("accepts PNG / JPEG / WebP / GIF up to the input limit", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) expect(checkImageFile(file(type, 1000))).toBeNull();
  });
  it("names the problem otherwise", () => {
    expect(checkImageFile(file("image/svg+xml", 10))).toBe("type");
    expect(checkImageFile(file("application/pdf", 10))).toBe("type");
    expect(checkImageFile(file("image/png", IMAGE_LIMITS.maxInputBytes + 1))).toBe("size");
  });
});
