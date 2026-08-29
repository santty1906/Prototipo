import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Validation and behaviour of the profile management actions.
 *
 * The data layer is mocked, so these run without a database. The point is that
 * bad input is rejected *before* any write, and that a valid edit maps onto the
 * existing nullable columns rather than inventing values.
 */

const updateProfile = vi.fn();
const updateProfileClassification = vi.fn();
const deleteProfile = vi.fn();
const redirect = vi.fn((_url: string): never => {
  // next/navigation's redirect throws to unwind; mirror that so the action's
  // control flow is exercised the way it runs in production.
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/server/profiles", () => ({
  updateProfile: (...args: unknown[]) => updateProfile(...args),
  updateProfileClassification: (...args: unknown[]) => updateProfileClassification(...args),
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

/**
 * The HR/business classification action: Tipo and Empresa.
 *
 * Separate from the DISC classification and from the profile edit form. The
 * point of these is that only allow-listed codes reach the data layer, that a
 * blank selection is stored as NULL rather than as "", and that the write is
 * confined to the two classification columns.
 */
describe("updateProfileClassificationAction", () => {
  beforeEach(() => {
    vi.resetModules();
    updateProfileClassification.mockReset().mockResolvedValue(ID);
    // Reset too, so "the profile edit action was not called" means it was not
    // called by *this* test rather than by an earlier describe block.
    updateProfile.mockReset();
  });

  const classification = (fields: Record<string, string>) =>
    form({ id: ID, profile_type: "", company: "", ...fields });

  it("accepts a valid Tipo", async () => {
    const { updateProfileClassificationAction } = await import("./actions");

    for (const value of ["RECRUITMENT", "CURRENT_EMPLOYEE"]) {
      updateProfileClassification.mockClear();
      const state = await updateProfileClassificationAction(
        IDLE,
        classification({ profile_type: value }),
      );

      expect(state.status).toBe("success");
      expect(updateProfileClassification).toHaveBeenCalledWith(ID, {
        profile_type: value,
        company: null,
      });
    }
  });

  it("rejects an invalid Tipo without touching the database", async () => {
    const { updateProfileClassificationAction } = await import("./actions");

    for (const value of ["MANAGER", "recruitment", "Proceso de reclutamiento", "CGPAN"]) {
      const state = await updateProfileClassificationAction(
        IDLE,
        classification({ profile_type: value }),
      );

      expect(state.status).toBe("error");
      expect(state.message).toBe("El tipo seleccionado no es válido.");
    }

    expect(updateProfileClassification).not.toHaveBeenCalled();
  });

  it("accepts every valid Empresa, including the one containing a slash", async () => {
    const { updateProfileClassificationAction } = await import("./actions");
    const companies = [
      "CGPAN", "CGCR", "CGELS", "CGGUATE", "CGCOL", "CGVEN",
      "INGRLJ", "INGBEM", "ECAR", "ADINAAPP",
      "CORPIT/IA", "CORPPUBLI", "CORPVENTA", "CORPCOMPRA", "CORPRRHH",
    ];

    for (const value of companies) {
      updateProfileClassification.mockClear();
      const state = await updateProfileClassificationAction(
        IDLE,
        classification({ company: value }),
      );

      expect(state.status).toBe("success");
      expect(updateProfileClassification).toHaveBeenCalledWith(ID, {
        profile_type: null,
        company: value,
      });
    }
  });

  it("rejects an invalid Empresa without touching the database", async () => {
    const { updateProfileClassificationAction } = await import("./actions");

    for (const value of ["ACME", "cgpan", "CGPAN'; drop table profiles; --", "DI"]) {
      const state = await updateProfileClassificationAction(
        IDLE,
        classification({ company: value }),
      );

      expect(state.status).toBe("error");
      expect(state.message).toBe("La empresa seleccionada no es válida.");
    }

    expect(updateProfileClassification).not.toHaveBeenCalled();
  });

  it("saves both fields together and confirms in Spanish", async () => {
    const { updateProfileClassificationAction } = await import("./actions");
    const state = await updateProfileClassificationAction(
      IDLE,
      classification({ profile_type: "CURRENT_EMPLOYEE", company: "CGGUATE" }),
    );

    expect(state).toEqual({
      status: "success",
      message: "Clasificación guardada correctamente.",
    });
    expect(updateProfileClassification).toHaveBeenCalledWith(ID, {
      profile_type: "CURRENT_EMPLOYEE",
      company: "CGGUATE",
    });
  });

  it("writes only the two classification columns, never the rest of the profile", async () => {
    const { updateProfileClassificationAction } = await import("./actions");
    // Extra fields are submitted alongside; none of them may reach the data layer.
    await updateProfileClassificationAction(
      IDLE,
      form({
        id: ID,
        profile_type: "RECRUITMENT",
        company: "ECAR",
        full_name: "Nombre Sustituido",
        position: "Cargo Sustituido",
        summary: "",
      }),
    );

    expect(updateProfileClassification).toHaveBeenCalledWith(ID, {
      profile_type: "RECRUITMENT",
      company: "ECAR",
    });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("stores an unselected field as NULL, so an unclassified profile stays valid", async () => {
    const { updateProfileClassificationAction } = await import("./actions");
    const state = await updateProfileClassificationAction(IDLE, classification({}));

    expect(state.status).toBe("success");
    expect(updateProfileClassification).toHaveBeenCalledWith(ID, {
      profile_type: null,
      company: null,
    });
  });

  it("rejects an id that is not a UUID", async () => {
    const { updateProfileClassificationAction } = await import("./actions");
    const state = await updateProfileClassificationAction(
      IDLE,
      form({ id: "not-a-uuid", profile_type: "RECRUITMENT", company: "CGPAN" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("Identificador de candidato no válido.");
    expect(updateProfileClassification).not.toHaveBeenCalled();
  });

  it("reports a data-layer failure in Spanish", async () => {
    updateProfileClassification.mockRejectedValue(new Error("Candidato no encontrado."));

    const { updateProfileClassificationAction } = await import("./actions");
    const state = await updateProfileClassificationAction(
      IDLE,
      classification({ company: "CGPAN" }),
    );

    expect(state).toEqual({ status: "error", message: "Candidato no encontrado." });
  });

  it("falls back to a Spanish message when the failure is not an Error", async () => {
    updateProfileClassification.mockRejectedValue("boom");

    const { updateProfileClassificationAction } = await import("./actions");
    const state = await updateProfileClassificationAction(
      IDLE,
      classification({ company: "CGPAN" }),
    );

    expect(state).toEqual({
      status: "error",
      message: "No se pudo guardar la clasificación.",
    });
  });
});
