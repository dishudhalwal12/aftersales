import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { silentLogger } from "../src/config";
import { ForbiddenError, NotConnectedError, NotFoundError } from "../src/errors";
import { createFakeManager } from "./helpers";

const SECRET = "test-secret-value-123";
const CONNECTION_ID = "wa_connection_01";
const BUSINESS_ID = "biz_test_01";

function build(manager = createFakeManager(), rateLimitMax?: number) {
  return {
    manager,
    app: createApp({ manager, secret: SECRET, logger: silentLogger, rateLimitMax }),
  };
}

function authed(app: ReturnType<typeof build>["app"]) {
  return request(app).post("/connect").set("x-baileys-secret", SECRET);
}

describe("HTTP API", () => {
  it("exposes a public health check without secrets", async () => {
    const { app } = build();
    const response = await request(app).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.connections).toEqual({ total: 1, connected: 0 });
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(JSON.stringify(response.body)).not.toContain("sessions");
  });

  it("rejects protected routes without the shared secret", async () => {
    const { app } = build();
    await request(app).get(`/status/${CONNECTION_ID}`).expect(401);
    await request(app)
      .get(`/status/${CONNECTION_ID}`)
      .set("x-baileys-secret", "wrong")
      .expect(401);
  });

  it("starts a connection and validates the payload", async () => {
    const { app, manager } = build();

    const response = await authed(app)
      .send({ connectionId: CONNECTION_ID, businessId: BUSINESS_ID })
      .expect(200);

    expect(response.body.connectionId).toBe(CONNECTION_ID);
    expect(response.body.qr).toContain("data:image/png");
    expect(manager.start).toHaveBeenCalledWith(CONNECTION_ID, BUSINESS_ID);

    await request(app)
      .post("/connect")
      .set("x-baileys-secret", SECRET)
      .send({ connectionId: "bad id", businessId: "" })
      .expect(400)
      .expect((res) => expect(res.body.error.code).toBe("VALIDATION_ERROR"));
  });

  it("returns the QR code and a 404 for unknown connections", async () => {
    const { app, manager } = build();

    const qr = await request(app)
      .get(`/qr/${CONNECTION_ID}`)
      .set("x-baileys-secret", SECRET)
      .expect(200);
    expect(qr.body.qr).toContain("data:image/png");

    manager.get.mockReturnValueOnce(null);
    await request(app)
      .get(`/qr/${CONNECTION_ID}`)
      .set("x-baileys-secret", SECRET)
      .expect(404);

    const status = await request(app)
      .get(`/status/${CONNECTION_ID}`)
      .set("x-baileys-secret", SECRET)
      .expect(200);
    expect(status.body.status).toBe("qr");
    expect(status.body.qrAvailable).toBe(true);
    expect(status.body).not.toHaveProperty("qr");
  });

  it("disconnects with logout by default", async () => {
    const { app, manager } = build();

    await request(app)
      .post(`/disconnect/${CONNECTION_ID}`)
      .set("x-baileys-secret", SECRET)
      .send({ businessId: BUSINESS_ID })
      .expect(200);
    expect(manager.disconnect).toHaveBeenCalledWith(CONNECTION_ID, BUSINESS_ID, {
      logout: true,
    });

    await request(app)
      .post(`/disconnect/${CONNECTION_ID}`)
      .set("x-baileys-secret", SECRET)
      .send({ businessId: BUSINESS_ID, logout: false })
      .expect(200);
    expect(manager.disconnect).toHaveBeenLastCalledWith(CONNECTION_ID, BUSINESS_ID, {
      logout: false,
    });
  });

  it("sends messages and maps access errors", async () => {
    const { app, manager } = build();

    const response = await request(app)
      .post("/send")
      .set("x-baileys-secret", SECRET)
      .send({
        connectionId: CONNECTION_ID,
        businessId: BUSINESS_ID,
        recipient: "919700000001",
        message: "Hello",
      })
      .expect(200);
    expect(response.body).toEqual({ messageId: "msg_123" });

    manager.send.mockRejectedValueOnce(new ForbiddenError());
    await request(app)
      .post("/send")
      .set("x-baileys-secret", SECRET)
      .send({
        connectionId: CONNECTION_ID,
        businessId: "biz_other_01",
        recipient: "919700000001",
        message: "Hello",
      })
      .expect(403);

    manager.send.mockRejectedValueOnce(new NotConnectedError());
    await request(app)
      .post("/send")
      .set("x-baileys-secret", SECRET)
      .send({
        connectionId: CONNECTION_ID,
        businessId: BUSINESS_ID,
        recipient: "919700000001",
        message: "Hello",
      })
      .expect(409);

    manager.send.mockRejectedValueOnce(new NotFoundError());
    await request(app)
      .post("/send")
      .set("x-baileys-secret", SECRET)
      .send({
        connectionId: CONNECTION_ID,
        businessId: BUSINESS_ID,
        recipient: "919700000001",
        message: "Hello",
      })
      .expect(404);

    await request(app)
      .post("/send")
      .set("x-baileys-secret", SECRET)
      .send({ connectionId: CONNECTION_ID, businessId: BUSINESS_ID })
      .expect(400);
  });

  it("rate-limits write endpoints", async () => {
    const { app } = build(createFakeManager(), 2);
    const send = () =>
      request(app)
        .post("/send")
        .set("x-baileys-secret", SECRET)
        .send({
          connectionId: CONNECTION_ID,
          businessId: BUSINESS_ID,
          recipient: "919700000001",
          message: "Hello",
        });

    await send().expect(200);
    await send().expect(200);
    await send().expect(429);
  });

  it("returns a JSON 404 for unknown endpoints", async () => {
    const { app } = build();
    await request(app)
      .get("/unknown")
      .set("x-baileys-secret", SECRET)
      .expect(404)
      .expect((response) => expect(response.body.error.code).toBe("NOT_FOUND"));
  });
});
