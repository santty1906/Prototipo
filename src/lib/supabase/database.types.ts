/**
 * Generated shape of the public schema.
 *
 * Kept by hand for the MVP; once the schema settles, regenerate with:
 *   npm run db:types
 */
export type ProcessingStatus =
  | "UPLOADING"
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  education: string | null;
  experience_years: number | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  profile_id: string | null;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
};

export type Trait = {
  id: string;
  profile_id: string;
  code: string;
  label: string;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Omit<Profile, "id" | "created_at" | "updated_at"> & { id?: string }
      >;
      documents: Table<
        DocumentRow,
        Omit<DocumentRow, "created_at" | "updated_at" | "processing_status" | "processing_error"> & {
          processing_status?: ProcessingStatus;
          processing_error?: string | null;
        }
      >;
      profile_capabilities: Table<Trait, Omit<Trait, "id" | "created_at">>;
      profile_attitudes: Table<Trait, Omit<Trait, "id" | "created_at">>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: { processing_status: ProcessingStatus };
    CompositeTypes: Record<never, never>;
  };
};
