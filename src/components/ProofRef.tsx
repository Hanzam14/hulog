import { t } from "../i18n";
import { PROOF_REF_MAX } from "../proofRef";

/**
 * The optional e-wallet reference number input. Validation happens in
 * cleanProofRef when the form is sent; the pattern only gives an early hint.
 */
export function ProofRefField({
  value,
  onChange,
  name,
  defaultValue,
}: {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  defaultValue?: string;
}) {
  return (
    <label>
      {t("Ref no. (optional)")}
      <input
        type="text"
        name={name}
        maxLength={PROOF_REF_MAX}
        autoComplete="off"
        placeholder={t("e.g. GCash or Maya ref no.")}
        {...(onChange
          ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
          : { defaultValue })}
      />
      <small className="meta">
        {t("Ref no. only — never your account number or PIN")}
      </small>
    </label>
  );
}

/** The saved reference, shown under an entry so the partner can match it. */
export function ProofRefLine({ value }: { value?: string | null }) {
  if (!value) return null;
  return <small className="proof-ref">{t("Ref {ref}", { ref: value })}</small>;
}
