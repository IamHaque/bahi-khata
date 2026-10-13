import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { paths } from "@/lib/paths";
import { toAppError, type AppError } from "@/lib/AppError";
import { toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/app/fields/TextField";
import { TextAreaField } from "@/components/app/fields/TextAreaField";
import { SelectField } from "@/components/app/fields/SelectField";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { useActiveBusiness } from "@/contexts/BusinessContext";
import { useCreateBusiness } from "@/features/business/hooks";
import {
  businessTypeOptions,
  createBusinessSchema,
  type CreateBusinessForm,
} from "@/features/business/schemas";

export function CreateBusinessPage() {
  const { status } = useActiveBusiness();
  const navigate = useNavigate();
  const createBusiness = useCreateBusiness();
  const [saveError, setSaveError] = useState<AppError | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const form = useForm<CreateBusinessForm>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: {
      name: "",
      businessType: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    },
  });

  const alreadyOwned = status === "ready";

  useEffect(() => {
    if (alreadyOwned) {
      toastSuccess("You already own a business");
    }
  }, [alreadyOwned]);

  if (alreadyOwned) {
    return <Navigate to={paths.dashboard} replace />;
  }

  const onSubmit = async (values: CreateBusinessForm) => {
    setSaveError(null);
    try {
      await createBusiness.mutateAsync({
        name: values.name.trim(),
        businessType: values.businessType || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
      });
      toastSuccess("Business created");
      navigate(paths.dashboard);
    } catch (err) {
      // The form keeps every value; the banner offers a retry.
      setSaveError(toAppError(err));
    }
  };

  return (
    <FormProvider {...form}>
      <OnboardingLayout
        title="Create your business"
        description="Just a name to start — you can add details any time."
      >
        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <TextField
            name="name"
            label="Name"
            placeholder="e.g. Rahim Traders"
            autoFocus
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

          {saveError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
            >
              <p className="text-sm font-medium text-destructive">
                Could not save your business
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {saveError.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void form.handleSubmit(onSubmit)()}
              >
                Try again
              </Button>
            </div>
          )}

          <Button type="submit" disabled={createBusiness.isPending}>
            {createBusiness.isPending && <Loader2 className="animate-spin" />}
            Create business
          </Button>
        </form>
      </OnboardingLayout>
    </FormProvider>
  );
}
