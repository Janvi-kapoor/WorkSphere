import * as snarkjs from "snarkjs";

interface PremiumProofRequest {
  type: "prove";
  identityToken: string;
  expectedCommit: string;
}

interface StudentProofRequest {
  type: "prove-student" | "prove_student";
  secret: string;
  epoch: string | number;
  root: string;
  pathElements: string[];
  pathIndices: number[];
}

interface VerifyRequest {
  type: "verify" | "verify-student";
  proof: unknown;
  publicSignals: string[];
  circuit?: "student_membership" | "premium_membership";
}

interface CancelMessage {
  type: "cancel";
}

type WorkerMessage =
  | PremiumProofRequest
  | StudentProofRequest
  | VerifyRequest
  | CancelMessage;

let generation = 0;

type WorkerErrorType = "oom" | "internal" | "generic";

function classifyError(error: unknown): WorkerErrorType {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Out-of-memory signals from WASM runtime or browser
    if (
      msg.includes("out of memory") ||
      msg.includes("memory access out of bounds") ||
      msg.includes("allocation failed") ||
      msg.includes("cannot allocate") ||
      (error instanceof RangeError && msg.includes("memory"))
    ) {
      return "oom";
    }
    if (msg.includes("wasm") || msg.includes("enoent") || msg.includes("instantiate")) {
      return "internal";
    }
  }
  return "generic";
}

function sanitizeError(error: unknown): string {
  const type = classifyError(error);
  if (type === "oom") {
    return "Your device does not have enough memory to generate the zero-knowledge proof. Please try again on a device with more RAM, or use the server-side verification option.";
  }
  if (type === "internal") {
    return "Proof generation failed due to an internal error.";
  }
  return "Proof generation failed.";
}

self.addEventListener("message", async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "cancel") {
    generation++;
    return;
  }

  // ── Browser Verification in Web Worker (#3480) ───────────────────────────
  if (e.data.type === "verify" || e.data.type === "verify-student") {
    const { proof, publicSignals, circuit } = e.data;
    try {
      const isStudent = circuit === "student_membership" || e.data.type === "verify-student" || publicSignals.length >= 2;
      const vKeyUrl = isStudent
        ? "/zkp/student_membership_vkey.json"
        : "/zkp/verification_key.json";

      const resp = await fetch(vKeyUrl);
      const vKey = await resp.json();
      const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof as any);
      self.postMessage({ type: "verify_result", isValid });
    } catch (error) {
      self.postMessage({
        type: "error",
        error: sanitizeError(error),
      });
    }
    return;
  }

  // ── Student Membership Groth16 Prover (#3480) ─────────────────────────────
  if (e.data.type === "prove-student" || e.data.type === "prove_student") {
    const myGeneration = ++generation;
    const { secret, epoch, root, pathElements, pathIndices } = e.data;

    if (!secret || !epoch || !root || !Array.isArray(pathElements) || !Array.isArray(pathIndices)) {
      self.postMessage({ type: "error", error: "Invalid student membership proof parameters." });
      return;
    }

    try {
      self.postMessage({ type: "progress", stage: "generating" });

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        {
          secret: String(secret),
          epoch: String(epoch),
          root: String(root),
          pathElements: pathElements.map(String),
          pathIndices: pathIndices.map(String),
        },
        "/zkp/student_membership.wasm",
        "/zkp/student_membership.zkey",
      );

      if (myGeneration !== generation) return;

      self.postMessage({ type: "success", proof, publicSignals });
    } catch (error) {
      if (myGeneration !== generation) return;
      const errorType = classifyError(error);
      self.postMessage({
        type: "error",
        error: sanitizeError(error),
        isOom: errorType === "oom",
      });
    } finally {
      const g = globalThis as typeof globalThis & {
        curve_bn128?: { terminate: () => Promise<void> };
      };
      if (g.curve_bn128) {
        try {
          await g.curve_bn128.terminate();
        } catch {
          // ignore cleanup errors
        }
      }
    }
    return;
  }

  // ── Premium Membership Prover (Legacy) ───────────────────────────────────
  if (e.data.type === "prove") {
    const myGeneration = ++generation;
    const { identityToken, expectedCommit } = e.data;

    if (
      typeof identityToken !== "string" ||
      !/^-?\d+$/.test(identityToken)
    ) {
      self.postMessage({ type: "error", error: "Invalid identity token." });
      return;
    }

    if (
      typeof expectedCommit !== "string" ||
      !/^-?\d+$/.test(expectedCommit)
    ) {
      self.postMessage({ type: "error", error: "Invalid commitment value." });
      return;
    }

    try {
      self.postMessage({ type: "progress", stage: "generating" });

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { identityToken, expectedCommit },
        "/zkp/premium_membership.wasm",
        "/zkp/premium_membership.zkey",
      );

      if (myGeneration !== generation) return;

      self.postMessage({ type: "success", proof, publicSignals });
    } catch (error) {
      if (myGeneration !== generation) return;
      const errorType = classifyError(error);
      self.postMessage({
        type: "error",
        error: sanitizeError(error),
        isOom: errorType === "oom",
      });
    } finally {
      const g = globalThis as typeof globalThis & {
        curve_bn128?: { terminate: () => Promise<void> };
      };
      if (g.curve_bn128) {
        try {
          await g.curve_bn128.terminate();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
});
