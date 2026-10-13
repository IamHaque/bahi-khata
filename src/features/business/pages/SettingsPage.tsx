import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toAppError } from "@/lib/AppError";
import { toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { TextField } from "@/components/app/fields/TextField";
import { TextAreaField } from "@/components/app/fields/TextAreaField";
import { SelectField } from "@/components/app/fields/SelectField";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { DangerZone } from "@/features/business/components/DangerZone";
import {
  useBusiness,
  useMemberships,
  useUpdateBusiness,
} from "@/features/business/hooks";
import type { Business } from "@/features/business/api";
import {
  businessTypeOptions,
  createBusinessSchema,
  type CreateBusinessForm,
} from "@/features/business/schemas";
import { useState } from "react";

/**
 * Business settings (S-18): the owner edits the details here; every
 * other member sees the same details read-only. The role check comes
 * from the URL business's membership — the minimal inline check until
 * S-21 ships the shared role hook.
 */
export function SettingsPage() {
  const businessId = useScopedBusinessId() ?? "";
  const { data: memberships } = useMemberships();
  const {
    data: business,
    isLoading,
    error,
    refetch,
  } = useBusiness(businessId);
  const updateBusiness = useUpdateBusiness(businessId);
  const [moreOpen, setMoreOpen] = useState(false);

  const membership = memberships?.businesses.find((b) => b.id === businessId);
  const isOwner = membership?.role === "owner";

  const form = useForm<CreateBusinessForm>({
    resolver: zodResolver(createBusinessSchema),
    // `values` keeps the form in sync with the server state when the
    // details load or change elsewhere; an unchanged object never
    // overwrites what the owner is typing.
    values: {
      name: business?.name ?? "",
      businessType: business?.business_type ?? "",
      phone: business?.phone ?? "",
      email: business?.email ?? "",
      address: business?.address ?? "",
      notes: business?.notes ?? "",
    },
  });

  const onSubmit = async (values: CreateBusinessForm) => {
    try {
      await updateBusiness.mutateAsync({
        name: values.name.trim(),
        businessType: values.businessType || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
      });
      toastSuccess("Business updated");
    } catch (err) {
      // Nothing changes: the form keeps every value, and the database
      // (owner-only policy) refused the update in the first place.
      const appError = toAppError(err);
      toast.error("Could not update business", {
        description: appError.message,
      });
    }
  };

  if (isLoading) {
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label="Loading business details"
      >
        <PageHeader title="Settings" />
        <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-muted" />
        <div className="h-24 w-full max-w-2xl animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
        >
          <p className="text-sm font-medium text-destructive">
            Could not load these details
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ?? "This business could not be found."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business details and who can change them."
      />

      {isOwner ? (
        <FormProvider {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="max-w-2xl space-y-4"
            noValidate
          >
            <TextField
              name="name"
              label="Name"
              placeholder="e.g. Rahim Traders"
            />

            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              More details
              {moreOpen ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>

            {moreOpen && (
              <div className="space-y-4">
                <SelectField
                  name="businessType"
                  label="Business type"
                  placeholder="Not specified"
                  options={businessTypeOptions}
                />
                <TextField
                  name="phone"
                  label="Phone"
                  placeholder="+91 98765 43210"
                />
                <TextField
                  name="email"
                  label="Email"
                  placeholder="orders@rahimtraders.example"
                />
                <TextAreaField
                  name="address"
                  label="Address"
                  placeholder="Shop address"
                />
                <TextAreaField
                  name="notes"
                  label="Notes"
                  placeholder="Anything useful later"
                />
              </div>
            )}

            <Button type="submit" disabled={updateBusiness.isPending}>
              {updateBusiness.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </form>
        </FormProvider>
      ) : (
        <ReadonlyDetails business={business} />
      )}

      {/* S-19: deletion is owner-only; non-owners never see this section */}
      {isOwner && (
        <DangerZone businessId={businessId} businessName={business.name} />
      )}
    </div>
  );
}

function ReadonlyDetails({ business }: { business: Business }) {
  return (
    <div className="max-w-2xl">
      <dl className="rounded-lg border border-border">
        <DetailRow label="Name" value={business.name} />
        <DetailRow label="Business type" value={business.business_type} />
        <DetailRow label="Phone" value={business.phone} />
        <DetailRow label="Email" value={business.email} />
        <DetailRow label="Address" value={business.address} />
        <DetailRow label="Notes" value={business.notes} />
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">
        Only the owner can change these details.
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
