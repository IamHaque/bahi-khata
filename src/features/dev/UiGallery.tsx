import { useEffect, useState, type ReactNode } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { Loader2, Moon, Plus, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { toastError, toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/Avatar";
import { BalanceBadge } from "@/components/app/BalanceBadge";
import { DataTable, RowActionsMenu, type Column } from "@/components/app/DataTable";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { DeleteCustomerDialog } from "@/features/customers/components/DeleteCustomerDialog";
import { DeleteTransactionDialog } from "@/features/transactions/components/DeleteTransactionDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { EntityDialog } from "@/components/app/EntityDialog";
import { ErrorState } from "@/components/app/ErrorState";
import { FilterBar } from "@/components/app/FilterBar";
import { Money } from "@/components/app/Money";
import { PageHeader } from "@/components/app/PageHeader";
import { SearchInput } from "@/components/app/SearchInput";
import { Skeleton, SkeletonRows } from "@/components/app/Skeleton";
import { StatCard } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { TextField } from "@/components/app/fields/TextField";
import { TextAreaField } from "@/components/app/fields/TextAreaField";
import { MoneyField } from "@/components/app/fields/MoneyField";
import { DateField } from "@/components/app/fields/DateField";
import { TagsField } from "@/components/app/fields/TagsField";
import { SelectField } from "@/components/app/fields/SelectField";
import { SegmentedField } from "@/components/app/fields/SegmentedField";

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="rounded-xl border border-border bg-card p-4">
        {children}
      </div>
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {children}
      </div>
    </div>
  );
}

const noop = () => {};

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function ButtonsSection() {
  return (
    <Section title="Buttons">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
        <Button disabled>
          <Loader2 className="animate-spin" />
          Saving…
        </Button>
        <Button variant="outline" size="sm">
          Small
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Money, badges, avatars                                              */
/* ------------------------------------------------------------------ */

function DisplaySection() {
  return (
    <Section title="Money, badges, avatars">
      <div className="space-y-3">
        <Specimen label="Money">
          <Money amount={1250} />
          <Money amount={-800} />
          <Money amount={0} />
          <Money amount={1250} signed />
        </Specimen>
        <Specimen label="BalanceBadge">
          <BalanceBadge balance={1250} />
          <BalanceBadge balance={-800} />
          <BalanceBadge balance={0} />
          <BalanceBadge balance={1250} size="lg" />
        </Specimen>
        <Specimen label="StatusBadge">
          <StatusBadge label="Owes you" tone="receivable" />
          <StatusBadge label="You owe" tone="credit" />
          <StatusBadge label="Settled" tone="muted" />
          <StatusBadge label="Void" tone="warning" />
          <StatusBadge label="Editor" tone="neutral" />
        </Specimen>
        <Specimen label="Avatar">
          <Avatar name="Asha Verma" />
          <Avatar name="Rahim Traders" size="sm" />
          <Avatar name="no-image@example.com" src={null} />
        </Specimen>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Cards and skeletons                                                 */
/* ------------------------------------------------------------------ */

function CardsSection() {
  return (
    <Section title="Cards and loading">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Owes you"
          value={<Money amount={48200} />}
          hint="Across 12 customers"
        />
        <StatCard label="You owe" value={<Money amount={9500} />} />
        <StatCard label="Today" value={<Skeleton className="h-7 w-24" />} />
        <StatCard
          label="Customers"
          value={<span className="text-destructive">—</span>}
          hint="Could not load"
        />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-40" />
        <SkeletonRows count={3} />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Empty and error states                                              */
/* ------------------------------------------------------------------ */

function StatesSection() {
  return (
    <Section title="Empty and error states">
      <div className="grid gap-3 lg:grid-cols-2">
        <EmptyState
          title="No customers yet"
          description="Add your first customer to start tracking balances."
        >
          <Button>
            <Plus />
            Add customer
          </Button>
        </EmptyState>
        <ErrorState
          message="Could not load customers. Try again."
          onRetry={noop}
        />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Page header, search, filters                                        */
/* ------------------------------------------------------------------ */

function ControlsSection() {
  const [search, setSearch] = useState("");
  return (
    <Section title="Page header, search, filters">
      <PageHeader
        title="Customers"
        description="Everyone who owes you or you owe."
        className="border-0 p-0"
      >
        <Button>
          <Plus />
          Add customer
        </Button>
      </PageHeader>
      <div className="mt-4 space-y-3">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search customers…"
          id="gallery-search"
        />
        <FilterBar
          chips={[
            { label: "Owes you", onRemove: noop },
            { label: "January 2026", onRemove: noop },
          ]}
          onClearAll={noop}
        />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* DataTable — five states                                             */
/* ------------------------------------------------------------------ */

interface DemoRow {
  id: string;
  name: string;
  balance: number;
}

const demoRows: DemoRow[] = [
  { id: "1", name: "Asha Verma", balance: 1250 },
  { id: "2", name: "Rahim Traders", balance: -800 },
  { id: "3", name: "City Mart", balance: 0 },
];

const demoColumns: Column<DemoRow>[] = [
  {
    key: "name",
    header: "Customer",
    sortable: true,
    render: (row) => row.name,
    sortValue: (row) => row.name,
  },
  {
    key: "balance",
    header: "Balance",
    align: "right",
    sortable: true,
    render: (row) => <BalanceBadge balance={row.balance} />,
    sortValue: (row) => row.balance,
  },
];

function TableSection() {
  const shared = {
    columns: demoColumns,
    getRowKey: (row: DemoRow) => row.id,
  };

  return (
    <Section title="DataTable — five states">
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Loading</p>
          <DataTable<DemoRow> {...shared} rows={[]} loading />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Empty</p>
          <DataTable<DemoRow>
            {...shared}
            rows={[]}
            emptyState={
              <EmptyState
                title="No customers yet"
                description="Add your first customer to start tracking balances."
              >
                <Button>
                  <Plus />
                  Add customer
                </Button>
              </EmptyState>
            }
          />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">No results</p>
          <DataTable<DemoRow>
            {...shared}
            rows={[]}
            noResultsState={
              <EmptyState
                title="No customers match your search"
                description="Try a different name or clear the filters."
              />
            }
            onClearFilters={noop}
          />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Error</p>
          <DataTable<DemoRow>
            {...shared}
            rows={[]}
            error="Could not load customers. Try again."
            onRetry={noop}
          />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Data + sort, paging, row actions</p>
          <DataTable<DemoRow>
            {...shared}
            rows={demoRows}
            sortBy="name"
            sortDir="asc"
            onSortChange={noop}
            page={1}
            pageSize={10}
            totalCount={42}
            onPageChange={noop}
            onPageSizeChange={noop}
            renderRowActions={(row) => (
              <RowActionsMenu
                triggerLabel={`Actions for ${row.name}`}
                items={[
                  { label: "View", onSelect: noop },
                  { label: "Edit", onSelect: noop },
                  {
                    label: "Archive",
                    onSelect: noop,
                    variant: "destructive",
                  },
                ]}
              />
            )}
            renderMobileCard={(row) => (
              <div className="flex items-center justify-between">
                <span>{row.name}</span>
                <BalanceBadge balance={row.balance} />
              </div>
            )}
          />
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields — default and error states                              */
/* ------------------------------------------------------------------ */

function FieldGrid({ withErrors }: { withErrors?: boolean }) {
  const form = useForm({
    defaultValues: {
      name: "",
      notes: "",
      amount: "",
      date: "",
      tags: "",
      category: "",
      type: "charge",
    },
  });

  useEffect(() => {
    if (!withErrors) return;
    form.setError("name", { message: "Name is required" });
    form.setError("amount", { message: "Enter a valid amount" });
    form.setError("category", { message: "Choose a category" });
  }, [withErrors, form]);

  return (
    <FormProvider {...form}>
      <div className="grid max-w-sm gap-4">
        <TextField
          name="name"
          label="Customer name"
          placeholder="e.g. Asha Verma"
        />
        <TextAreaField name="notes" label="Notes" placeholder="Optional" />
        <MoneyField name="amount" label="Amount" />
        <DateField name="date" label="Date" />
        <TagsField
          name="tags"
          label="Tags"
          placeholder="wholesale, regular"
          hint="Separate with commas"
        />
        <SelectField
          name="category"
          label="Category"
          placeholder="Pick one"
          options={[
            { value: "groceries", label: "Groceries" },
            { value: "rent", label: "Rent" },
            { value: "salaries", label: "Salaries" },
          ]}
        />
        <SegmentedField
          name="type"
          label="Type"
          options={[
            { value: "charge", label: "Charge" },
            { value: "payment", label: "Payment" },
          ]}
        />
      </div>
    </FormProvider>
  );
}

function FieldsSection() {
  return (
    <Section title="Form fields — default and inline errors">
      <div className="grid gap-8 lg:grid-cols-2">
        <FieldGrid />
        <FieldGrid withErrors />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs and toasts                                                  */
/* ------------------------------------------------------------------ */

const entitySchema = z.object({ name: z.string().min(1, "Name is required") });

function DialogsSection() {
  const [entityOpen, setEntityOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [customerDeleteOpen, setCustomerDeleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Section title="Dialogs and toasts">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setEntityOpen(true)}>
          <Plus />
          Add customer (EntityDialog)
        </Button>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          Archive customer (ConfirmDialog)
        </Button>
        <Button
          variant="destructive"
          onClick={() => setCustomerDeleteOpen(true)}
        >
          Delete customer (v3 typed confirmation + Undo)
        </Button>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          Delete transaction (v3 delete + Undo)
        </Button>
        <Button
          variant="outline"
          onClick={() => toastSuccess("Customer archived")}
        >
          Success toast
        </Button>
        <Button
          variant="outline"
          onClick={() => toastError("archive customer")}
        >
          Error toast
        </Button>
      </div>

      <EntityDialog
        open={entityOpen}
        onOpenChange={setEntityOpen}
        title="Add customer"
        description="Demo of the shared create/edit container."
        schema={entitySchema}
        defaultValues={{ name: "" }}
        submitLabel="Add customer"
        onSubmit={async () => {
          toastSuccess("Customer added");
        }}
      >
        <TextField name="name" label="Name" autoFocus />
      </EntityDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Archive Asha Verma?"
        description="She will be hidden from lists. You can restore her later."
        confirmLabel="Archive customer"
        onConfirm={() => toastSuccess("Customer archived")}
      />

      {/* v3 (S-55): the gentler delete — recovery copy, the softer
          paths inside, typed name, 10s Undo. */}
      <DeleteCustomerDialog
        open={customerDeleteOpen}
        onOpenChange={setCustomerDeleteOpen}
        businessId="b1"
        customer={{ id: "gallery-c1", name: "Rahim Traders" }}
      />

      {/* v3 (S-54): the delete dialog with the balance sentence and the
          Void instead escape hatch (both onVoidInstead branches). */}
      <DeleteTransactionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        businessId="b1"
        transaction={{
          id: "gallery-t1",
          type: "charge",
          amount: 50000,
          occurred_at: "2026-10-20T10:00:00+00:00",
          customer_name: "Rahim Uddin",
          balance_before: 100000,
          balance_after: 50000,
        }}
        onVoidInstead={() => toastSuccess("Void instead (demo)")}
      />
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Gallery page                                                        */
/* ------------------------------------------------------------------ */

export function UiGallery() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              UI Gallery
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every shared component in its states. Development builds only —
              this route is not registered in production.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun /> : <Moon />}
            {isDark ? "Light" : "Dark"}
          </Button>
        </div>

        <ButtonsSection />
        <DisplaySection />
        <CardsSection />
        <StatesSection />
        <ControlsSection />
        <TableSection />
        <FieldsSection />
        <DialogsSection />
      </div>
    </div>
  );
}
