export type DroneMembershipRole = "owner" | "admin" | "analyst" | "viewer";
export type DroneEntitlementStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "refunded"
  | "pending";

export type Database = {
  public: {
    Tables: {
      drone_orgs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
      };
      drone_memberships: {
        Row: {
          org_id: string;
          user_id: string;
          role: DroneMembershipRole;
          created_at: string;
        };
      };
      drone_entitlements: {
        Row: {
          id: string;
          org_id: string;
          product_id: string;
          tier_id: string;
          status: DroneEntitlementStatus;
          source: string;
          external_reference: string | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
};
