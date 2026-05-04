const CAPSOLVER_API = "https://api.capsolver.com";

interface CreateTaskResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: string;
}

interface GetTaskResultResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  status: "idle" | "processing" | "ready" | "failed";
  solution?: {
    cookie: string;
  };
}

export async function solveDatadomeCaptcha(
  captchaUrl: string,
  userAgent: string,
  proxy: string
): Promise<string | null> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) {
    console.warn("[CapSolver] No CAPSOLVER_API_KEY set, skipping CAPTCHA solve");
    return null;
  }

  console.log("[CapSolver] Creating DatadomeSlider task...");

  const createRes = await fetch(`${CAPSOLVER_API}/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: {
        type: "DatadomeSliderTask",
        captchaUrl,
        userAgent,
        proxy,
      },
    }),
  });

  const createData = (await createRes.json()) as CreateTaskResponse;

  if (createData.errorId !== 0 || !createData.taskId) {
    console.error(
      `[CapSolver] Task creation failed: ${createData.errorCode} - ${createData.errorDescription}`
    );
    return null;
  }

  console.log(`[CapSolver] Task created: ${createData.taskId}, polling...`);

  // Poll for result (max 60 seconds)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const resultRes = await fetch(`${CAPSOLVER_API}/getTaskResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        taskId: createData.taskId,
      }),
    });

    const resultData = (await resultRes.json()) as GetTaskResultResponse;

    if (resultData.status === "ready" && resultData.solution?.cookie) {
      console.log("[CapSolver] CAPTCHA solved successfully");
      return resultData.solution.cookie;
    }

    if (resultData.status === "failed" || resultData.errorId !== 0) {
      console.error(
        `[CapSolver] Solve failed: ${resultData.errorCode} - ${resultData.errorDescription}`
      );
      return null;
    }
  }

  console.error("[CapSolver] Timeout waiting for solution");
  return null;
}
