import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";
import { renderApp } from "@/test/app-render";
import { EntityDialog } from "@/components/app/EntityDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { TextField } from "@/components/app/fields/TextField";
import { MoneyField } from "@/components/app/fields/MoneyField";
import { DateField } from "@/components/app/fields/DateField";
import { TagsField } from "@/components/app/fields/TagsField";
import { SelectField } from "@/components/app/fields/SelectField";
import { SegmentedField } from "@/components/app/fields/SegmentedField";

const schema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  type: z.enum(["charge", "payment"], {
    message: "Choose a type",
  }),
  tags: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  category: z.string().optional(),
});

function DialogProbe({
  onSubmit,
  defaultValues,
}: {
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  defaultValues?: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <EntityDialog
      open={open}
      onOpenChange={setOpen}
      title="Add customer"
      schema={schema}
      defaultValues={{
        name: "",
        amount: "" as unknown as number,
        type: "charge" as "charge" | "payment",
        tags: "",
        date: "2026-01-01",
        ...defaultValues,
      }}
      submitLabel="Add customer"
      onSubmit={onSubmit}
    >
      <TextField name="name" label="Name" autoFocus />
      <MoneyField name="amount" label="Amount" />
      <SegmentedField
        name="type"
        label="Type"
        options={[
          { value: "charge", label: "Charge" },
          { value: "payment", label: "Payment" },
        ]}
      />
      <TagsField name="tags" label="Tags" />
      <DateField name="date" label="Date" />
    </EntityDialog>
  );
}

describe("form fields", () => {
  it("TextField shows a persistent label and an inline error from the zod schema", async () => {
    const onSubmit = vi.fn();
    renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));

    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("all field types render with labels", () => {
    renderApp(
      <EntityDialog
        open
        onOpenChange={() => {}}
        title="Add customer"
        schema={schema}
        defaultValues={{
          name: "",
          amount: "" as unknown as number,
          type: "charge",
          tags: "",
          date: "2026-01-01",
          category: "retail",
        }}
        submitLabel="Add customer"
        onSubmit={() => {}}
      >
        <TextField name="name" label="Name" />
        <MoneyField name="amount" label="Amount" />
        <DateField name="date" label="Date" />
        <TagsField name="tags" label="Tags" />
        <SelectField
          name="category"
          label="Category"
          options={[
            { value: "retail", label: "Retail" },
            { value: "wholesale", label: "Wholesale" },
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
      </EntityDialog>,
    );

    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByLabelText("Date")).toBeTruthy();
    expect(screen.getByLabelText("Tags")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Charge" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Payment" })).toBeTruthy();
  });

  it("MoneyField maps empty input back to an empty string and numbers to numbers", async () => {
    const onSubmit = vi.fn();
    renderApp(
      <EntityDialog
        open
        onOpenChange={() => {}}
        title="Add"
        schema={schema}
        defaultValues={{ name: "A", amount: 0, type: "charge", tags: "" }}
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <TextField name="name" label="Name" />
        <MoneyField name="amount" label="Amount" />
        <SegmentedField
          name="type"
          label="Type"
          options={[
            { value: "charge", label: "Charge" },
            { value: "payment", label: "Payment" },
          ]}
        />
      </EntityDialog>,
    );

    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(amount.value).toBe("0");
  });
});

describe("EntityDialog", () => {
  it("submits typed values through react-hook-form", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha Verma");
    await userEvent.click(screen.getByRole("radio", { name: "Payment" }));
    await userEvent.type(screen.getByLabelText("Amount"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Asha Verma", amount: 500, type: "payment" }),
    );
  });

  it("TagsField submits the comma-separated string for the parent to convert", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    await userEvent.type(screen.getByLabelText("Tags"), "wholesale, regular");
    await userEvent.type(screen.getByLabelText("Amount"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ tags: "wholesale, regular" }),
    );
  });

  it("keeps the dialog open with values intact when the save fails", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Network error. Check your connection and try again."));
    const { container } = renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    await userEvent.type(screen.getByLabelText("Amount"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (screen.getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Asha");
    expect(container).toBeTruthy();
  });

  it("maps field-level errors to the fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      fieldErrors: { name: "A customer with this name and phone exists" },
      message: "duplicate",
    });
    renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    await userEvent.type(screen.getByLabelText("Amount"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Add customer" }));

    expect(
      await screen.findByText("A customer with this name and phone exists"),
    ).toBeTruthy();
  });

  it("asks before discarding dirty changes", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    const dialogs = await screen.findAllByRole("dialog");
    expect(
      dialogs.some((d) => d.textContent?.includes("Discard changes?")),
    ).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByText("Add customer")).toBeNull();
  });

  it("keeps the dialog open when the discard is cancelled", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderApp(<DialogProbe onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await screen.findAllByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add customer" })).toBeTruthy();
  });
});

describe("ConfirmDialog", () => {
  it("confirms with a specific action label", async () => {
    const onConfirm = vi.fn();
    renderApp(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Archive customer?"
        description="This keeps all transactions but hides the customer."
        confirmLabel="Archive customer"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Archive customer?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Archive customer" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirm button disabled until the exact text is typed", async () => {
    const onConfirm = vi.fn();
    renderApp(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete business?"
        confirmLabel="Delete business"
        typingConfirmation="Rahim Traders"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", {
      name: "Delete business",
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Type/), "Rahim");
    expect(confirmButton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/Type/), " Traders");
    expect(confirmButton.disabled).toBe(false);

    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
