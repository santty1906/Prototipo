import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Validation and behaviour of the profile management actions.
 *
 * The data layer is mocked, so these run without a database. The point is that
 * bad input is rejected *before* any write, and that a valid edit maps onto the
 * existing nullable columns rather than inventing values.
 */

const updateProfile = vi.fn();
const deleteProfile = vi.fn();
const redirect = vi.fn((_url: string): never => {
  // next/navigation's redirect throws to unwind; mirror that so the action's
  // control flow is exercised the way it runs in production.
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/server/profiles", () => ({
  updateProfile: (...args: unknown[]) => updateProfile(...args),
  deleteProfile: (...args: unknown[]) => deleteProfile(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const ID = "11111111-2222-4333-8444-555555555555";
const IDLE = { status: "idle" as const, message: null };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const validEdit = {
  id: ID,
  full_name: "Nicolás Gallo Aranda",
  position: "Analista",
  department: "Operaciones",
  education: "Ingeniería",
  experience_years: "8",
};

describe("updateProfileAction", () => {
  beforeEach(() => {
    vi.resetModules();
    updateProfile.mockReset().mockResolvedValue(ID);
  });

  it("saves valid changes and reports success", async () => {
    const { updateProfileAction } = await import("./actions");
    const state = await updateProfileAction(IDLE, form(validEdit));

    expect(state.status).toBe("success");
    expect(updateProfile).toHaveBeenCalledWith(ID, {
      full_name: "Nicolás Gallo Aranda",
      position: "Analista",
      department: "Operaciones",
      education: "Ingeniería",
      experience_years: 8,
    });
  });

  it("stores blank optional fields as NULL, preserving nullability", async () => {
    const { updateProfileAction } = await import("./actions");
    await updateProfileAction(
      IDLE,
      form({ ...validEdit, position: "", department: "", education: "", experience_years: "" }),
    );

    expect(updateProfile).toHaveBeenCalledWith(ID, {
      full_name: "Nicolás Gallo Aranda",
      position: null,
      department: null,
      education: null,
      experience_years: null,
    });
  });

  it("only ever updates the fields on the form — never email, phone or summary", async () => {
    const { updateProfileAction } = await import("./actions");
    await updateProfileAction(IDLE, form({ ...validEdit, email: "x@y.z", summary: "hacked" }));

    const [, payload] = updateProfile.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual([
      "department",
      "education",
      "experience_years",
      "full_name",
      "position",
    ]);
  });

  it("rejects an empty name without writing", async () => {
    const { updateProfileAction } = await import("./actions");
    const state = await updateProfileAction(IDLE, form({ ...validEdit, full_name: "   " }));

    expect(state.status).toBe("error");
    expect(state.message).toContain("nombre completo es obligatorio");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID id without writing", async () => {
    const { updateProfileAction } = await import("./actions");
    const state = await updateProfileAction(IDLE, form({ ...validEdit, id: "nope" }));

    expect(state.status).toBe("error");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it.each(["71", "abc", "-3", "999"])(
    "rejects experience_years %s, which the DB CHECK would refuse",
    async (value) => {
      const { updateProfileAction } = await import("./actions");
      const state = await updateProfileAction(IDLE, form({ ...validEdit, experience_years: value }));

      expect(state.status).toBe("error");
      expect(updateProfile).not.toHaveBeenCalled();
    },
  );

  it("accepts the boundary values 0 and 70", async () => {
    const { updateProfileAction } = await import("./actions");
    for (const value of ["0", "70"]) {
      updateProfile.mockClear();
      const state = await updateProfileAction(IDLE, form({ ...validEdit, experience_years: value }));
      expect(state.status).toBe("success");
      expect(updateProfile.mock.calls[0][1].experience_years).toBe(Number(value));
    }
  });

  it("surfaces a data-layer failure as an error state rather than throwing", async () => {
    updateProfile.mockRejectedValue(new Error("boom"));
    const { updateProfileAction } = await import("./actions");
    const state = await updateProfileAction(IDLE, form(validEdit));

    expect(state.status).toBe("error");
    expect(state.message).toBe("boom");
  });
});

describe("deleteProfileAction", () => {
  beforeEach(() => {
    vi.resetModules();
    deleteProfile.mockReset().mockResolvedValue({ documentsDeleted: 1, storageObjectsDeleted: 1 });
    redirect.mockClear();
  });

  it("deletes and then returns to the candidate list", async () => {
    const { deleteProfileAction } = await import("./actions");

    // redirect() throws by design, so the action never returns normally here.
    await expect(deleteProfileAction(IDLE, form({ id: ID }))).rejects.toThrow("NEXT_REDIRECT");
    expect(deleteProfile).toHaveBeenCalledWith(ID);
    expect(redirect).toHaveBeenCalledWith("/profiles?deleted=1");
  });

  it("rejects a non-UUID id without deleting anything", async () => {
    const { deleteProfileAction } = await import("./actions");
    const state = await deleteProfileAction(IDLE, form({ id: "nope" }));

    expect(state.status).toBe("error");
    expect(deleteProfile).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports a failure and does NOT redirect, so the row is not assumed gone", async () => {
    deleteProfile.mockRejectedValue(new Error("FK violation"));
    const { deleteProfileAction } = await import("./actions");
    const state = await deleteProfileAction(IDLE, form({ id: ID }));

    expect(state.status).toBe("error");
    expect(state.message).toBe("FK violation");
    expect(redirect).not.toHaveBeenCalled();
  });
});
