import { FormEvent, useState } from 'react';
import { cardApplicationSchema, type CardApplicationPayload } from '~/lib/cards/application-schema';
import { formatRutInput, isValidRut } from '~/lib/rut';

type SubmitResult
  = | {
    ok: true
    decision: 'approved' | 'rejected' | 'pending_rai_approval' | 'manual_review'
    customerMessage: string
    applicationId: number
  }
  | {
    ok: false
    error: string
  };

const initialForm: CardApplicationPayload = {
  companyName: '',
  companyRut: '',
  companyAddress: '',
  companyCommune: '',
  companyWebsiteUrl: '',
  monthlyTransactions: '',
  averageTicketClp: '',
  contactEmail: '',
  legalRepName: '',
  legalRepLastName: '',
  legalRepRut: '',
  legalRepBirthDate: '',
  mcc: '',
};

function formatWithThousandsDots(rawNumeric: string): string {
  const digits = rawNumeric.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrencyClp(rawNumeric: string): string {
  const formatted = formatWithThousandsDots(rawNumeric);
  return formatted ? `$ ${formatted}` : '';
}

export default function CardApplicationPage() {
  const [form, setForm] = useState<CardApplicationPayload>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CardApplicationPayload, string>>>({});
  const companyRutValid = form.companyRut.length === 0 || isValidRut(form.companyRut);
  const legalRepRutValid = form.legalRepRut.length === 0 || isValidRut(form.legalRepRut);

  const decisionMeta = result?.ok
    ? ({
        approved: {
          title: 'Solicitud aprobada',
          badge: 'Aprobado',
          classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
          icon: '✅',
        },
        pending_rai_approval: {
          title: 'Solicitud en revision',
          badge: 'Revision',
          classes: 'border-amber-200 bg-amber-50 text-amber-800',
          icon: '⏳',
        },
        manual_review: {
          title: 'Solicitud en revision manual',
          badge: 'Revision manual',
          classes: 'border-blue-200 bg-blue-50 text-blue-800',
          icon: '📝',
        },
        rejected: {
          title: 'Solicitud rechazada',
          badge: 'No aprobada',
          classes: 'border-rose-200 bg-rose-50 text-rose-800',
          icon: '❌',
        },
      } as const)[result.decision]
    : null;

  function updateField<K extends keyof CardApplicationPayload>(key: K, value: CardApplicationPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function submitApplication(payload: CardApplicationPayload): Promise<{ response: Response, payload: SubmitResult }> {
    const response = await fetch('/api/cards/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as SubmitResult;
    return { response, payload: responsePayload };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    const validation = cardApplicationSchema.safeParse(form);
    if (!validation.success) {
      const nextErrors: Partial<Record<keyof CardApplicationPayload, string>> = {};
      const flattened = validation.error.flatten().fieldErrors;
      for (const [key, messages] of Object.entries(flattened)) {
        const firstMessage = messages?.[0];
        if (firstMessage) {
          nextErrors[key as keyof CardApplicationPayload] = firstMessage;
        }
      }

      setFieldErrors(nextErrors);
      setResult({ ok: false, error: 'Revisa los campos del formulario antes de enviar.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { response, payload } = await submitApplication(validation.data);
      if (!response.ok) {
        setResult({ ok: false, error: 'No pudimos procesar tu solicitud. Intentalo nuevamente.' });
        return;
      }

      setResult(payload);
      setForm(initialForm);
      setFieldErrors({});
    } catch {
      let recovered: SubmitResult | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        try {
          const { response, payload } = await submitApplication(validation.data);
          if (response.ok) {
            recovered = payload;
            break;
          }
        } catch {
          // keep retrying within this recovery window
        }
      }

      if (recovered?.ok) {
        setResult(recovered);
        setForm(initialForm);
        setFieldErrors({});
      } else {
        setResult({
          ok: false,
          error: 'La solicitud puede haberse procesado. Revisa Slack y vuelve a intentar solo si no aparece.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <section className="flex items-center justify-center gap-3">
        <img
          src="https://cdn.prod.website-files.com/601dbbde39e143d6cebd0831/6849cc9c48b58fef1ebb5586_Favico.png"
          alt="Fintoc logo"
          className="h-8 w-8 rounded"
        />
        <span className="text-xl font-semibold tracking-tight">Fintoc</span>
      </section>

      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Solicitud de activacion de tarjetas</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Completa este formulario para iniciar la evaluacion automatica de activacion.
        </p>
      </section>

      {result?.ok && decisionMeta
        ? (
            <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className={`rounded-xl border p-5 ${decisionMeta.classes}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {decisionMeta.icon}
                    {' '}
                    {decisionMeta.title}
                  </h2>
                  <span className="rounded-full border border-current px-3 py-1 text-xs font-medium">
                    {decisionMeta.badge}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">
                  {result.customerMessage}
                </p>
              </div>

              <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="text-base font-semibold tracking-tight text-zinc-900">
                  Condiciones tarjetas
                </h3>
                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-zinc-100">
                        <td className="px-4 py-3 text-zinc-700">Tarjeta de credito</td>
                        <td className="px-4 py-3 text-right font-semibold text-zinc-900">2.69%</td>
                      </tr>
                      <tr className="border-b border-zinc-100">
                        <td className="px-4 py-3 text-zinc-700">Tarjeta de debito</td>
                        <td className="px-4 py-3 text-right font-semibold text-zinc-900">2.69%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-zinc-700">Tarjeta prepago</td>
                        <td className="px-4 py-3 text-right font-semibold text-zinc-900">2.69%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs font-medium text-zinc-600">
                  Los valores no incluyen IVA.
                </p>
                <p className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">Liquidaciones en T+1:</span>
                  {' '}
                  recibiras los pagos hechos hoy entre 00:00 y 23:59 manana a las 19:00.
                </p>
              </section>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setFieldErrors({});
                    setForm(initialForm);
                  }}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                >
                  Volver al formulario
                </button>
              </div>
            </section>
          )
        : null}

      {result && !result.ok
        ? (
            <section className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <p>{result.error}</p>
            </section>
          )
        : null}

      {!result?.ok
        ? (
            <form className="grid gap-4" onSubmit={onSubmit}>
              <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900">Informacion empresa</h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Nombre
                    <input
                      className={`rounded-md border px-3 py-2 ${fieldErrors.companyName ? 'border-red-500' : 'border-zinc-300'}`}
                      value={form.companyName}
                      onChange={(event) => updateField('companyName', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.companyName)}
                      required
                    />
                    {fieldErrors.companyName ? <span className="text-xs text-red-600">{fieldErrors.companyName}</span> : null}
                  </label>

                  <label className="grid gap-1 text-sm">
                    RUT
                    <input
                      className={`rounded-md border px-3 py-2 ${
                        !companyRutValid || fieldErrors.companyRut ? 'border-red-500' : 'border-zinc-300'
                      }`}
                      value={form.companyRut}
                      onChange={(event) => updateField('companyRut', formatRutInput(event.target.value))}
                      placeholder="12.345.678-5"
                      maxLength={12}
                      aria-invalid={!companyRutValid || Boolean(fieldErrors.companyRut)}
                      required
                    />
                    {!companyRutValid || fieldErrors.companyRut
                      ? (
                          <span className="text-xs text-red-600">
                            {fieldErrors.companyRut ?? 'RUT empresa invalido'}
                          </span>
                        )
                      : null}
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Direccion
                    <input
                      className={`rounded-md border px-3 py-2 ${fieldErrors.companyAddress ? 'border-red-500' : 'border-zinc-300'}`}
                      value={form.companyAddress}
                      onChange={(event) => updateField('companyAddress', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.companyAddress)}
                      required
                    />
                    {fieldErrors.companyAddress ? <span className="text-xs text-red-600">{fieldErrors.companyAddress}</span> : null}
                  </label>

                  <label className="grid gap-1 text-sm">
                    Comuna
                    <input
                      className={`rounded-md border px-3 py-2 ${fieldErrors.companyCommune ? 'border-red-500' : 'border-zinc-300'}`}
                      value={form.companyCommune}
                      onChange={(event) => updateField('companyCommune', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.companyCommune)}
                      required
                    />
                    {fieldErrors.companyCommune ? <span className="text-xs text-red-600">{fieldErrors.companyCommune}</span> : null}
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Sitio web (URL ecommerce)
                    <input
                      className={`rounded-md border px-3 py-2 ${
                        fieldErrors.companyWebsiteUrl ? 'border-red-500' : 'border-zinc-300'
                      }`}
                      value={form.companyWebsiteUrl ?? ''}
                      onChange={(event) => updateField('companyWebsiteUrl', event.target.value)}
                      placeholder="https://... o www..."
                      aria-invalid={Boolean(fieldErrors.companyWebsiteUrl)}
                      required
                    />
                    {fieldErrors.companyWebsiteUrl ? <span className="text-xs text-red-600">{fieldErrors.companyWebsiteUrl}</span> : null}
                  </label>

                  <label className="grid gap-1 text-sm">
                    MCC (opcional, 4 digitos)
                    <input
                      className={`rounded-md border px-3 py-2 ${fieldErrors.mcc ? 'border-red-500' : 'border-zinc-300'}`}
                      value={form.mcc ?? ''}
                      onChange={(event) => updateField('mcc', event.target.value.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      inputMode="numeric"
                      aria-invalid={Boolean(fieldErrors.mcc)}
                    />
                    {fieldErrors.mcc ? <span className="text-xs text-red-600">{fieldErrors.mcc}</span> : null}
                  </label>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <span className="hidden md:block" aria-hidden />
                  <p className="pl-3 text-xs leading-4 text-zinc-500">
                    Es el codigo del rubro de tu negocio; lo puedes pedir
                    <br />
                    a tu adquirente.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    # Transacciones mensuales
                    <input
                      className={`rounded-md border px-3 py-2 ${
                        fieldErrors.monthlyTransactions ? 'border-red-500' : 'border-zinc-300'
                      }`}
                      value={formatWithThousandsDots(form.monthlyTransactions)}
                      onChange={(event) => updateField('monthlyTransactions', event.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      placeholder="1.000"
                      aria-invalid={Boolean(fieldErrors.monthlyTransactions)}
                      required
                    />
                    {fieldErrors.monthlyTransactions ? <span className="text-xs text-red-600">{fieldErrors.monthlyTransactions}</span> : null}
                  </label>

                  <label className="grid gap-1 text-sm">
                    Ticket promedio (CLP)
                    <input
                      className={`rounded-md border px-3 py-2 ${
                        fieldErrors.averageTicketClp ? 'border-red-500' : 'border-zinc-300'
                      }`}
                      value={formatCurrencyClp(form.averageTicketClp)}
                      onChange={(event) => updateField('averageTicketClp', event.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      placeholder="$ 50.000"
                      aria-invalid={Boolean(fieldErrors.averageTicketClp)}
                      required
                    />
                    {fieldErrors.averageTicketClp ? <span className="text-xs text-red-600">{fieldErrors.averageTicketClp}</span> : null}
                  </label>
                </div>

                <label className="mt-4 grid gap-1 text-sm">
                  Email de contacto
                  <input
                    className={`rounded-md border px-3 py-2 ${fieldErrors.contactEmail ? 'border-red-500' : 'border-zinc-300'}`}
                    type="email"
                    value={form.contactEmail}
                    onChange={(event) => updateField('contactEmail', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.contactEmail)}
                    required
                  />
                  {fieldErrors.contactEmail ? <span className="text-xs text-red-600">{fieldErrors.contactEmail}</span> : null}
                </label>
              </section>

              <section className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900">Informacion Representante Legal</h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Nombre
                    <input
                      className={`rounded-md border px-3 py-2 ${fieldErrors.legalRepName ? 'border-red-500' : 'border-zinc-300'}`}
                      value={form.legalRepName}
                      onChange={(event) => updateField('legalRepName', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.legalRepName)}
                      required
                    />
                    {fieldErrors.legalRepName ? <span className="text-xs text-red-600">{fieldErrors.legalRepName}</span> : null}
                  </label>

                  <label className="grid gap-1 text-sm">
                    Apellido
                    <input
                      className={`rounded-md border px-3 py-2 ${fieldErrors.legalRepLastName ? 'border-red-500' : 'border-zinc-300'}`}
                      value={form.legalRepLastName}
                      onChange={(event) => updateField('legalRepLastName', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.legalRepLastName)}
                      required
                    />
                    {fieldErrors.legalRepLastName ? <span className="text-xs text-red-600">{fieldErrors.legalRepLastName}</span> : null}
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    RUT
                    <input
                      className={`rounded-md border px-3 py-2 ${
                        !legalRepRutValid || fieldErrors.legalRepRut ? 'border-red-500' : 'border-zinc-300'
                      }`}
                      value={form.legalRepRut}
                      onChange={(event) => updateField('legalRepRut', formatRutInput(event.target.value))}
                      placeholder="12.345.678-5"
                      maxLength={12}
                      aria-invalid={!legalRepRutValid || Boolean(fieldErrors.legalRepRut)}
                      required
                    />
                    {!legalRepRutValid || fieldErrors.legalRepRut
                      ? (
                          <span className="text-xs text-red-600">
                            {fieldErrors.legalRepRut ?? 'RUT representante invalido'}
                          </span>
                        )
                      : null}
                  </label>

                  <label className="grid gap-1 text-sm">
                    Fecha de nacimiento
                    <input
                      className={`rounded-md border px-3 py-2 ${
                        fieldErrors.legalRepBirthDate ? 'border-red-500' : 'border-zinc-300'
                      }`}
                      type="date"
                      value={form.legalRepBirthDate}
                      onChange={(event) => updateField('legalRepBirthDate', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.legalRepBirthDate)}
                      required
                    />
                    {fieldErrors.legalRepBirthDate ? <span className="text-xs text-red-600">{fieldErrors.legalRepBirthDate}</span> : null}
                  </label>
                </div>
              </section>

              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-zinc-500">
                <img
                  src="https://cdn.prod.website-files.com/601dbbde39e143d6cebd0831/6849cc9c48b58fef1ebb5586_Favico.png"
                  alt="Fintoc icon"
                  className="h-4 w-4 rounded"
                />
                <span>Powered by Fintoc</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Enviando, esto puede tardar 1 min...' : 'Enviar solicitud'}
              </button>
            </form>
          )
        : null}
    </main>
  );
}
