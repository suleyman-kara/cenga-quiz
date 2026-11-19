import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest globals are off, so RTL can't register its own auto-cleanup.
afterEach(() => cleanup());
