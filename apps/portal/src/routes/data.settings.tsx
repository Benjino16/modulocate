import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@modulocate/ui/components/button";
import { Label } from "@modulocate/ui/components/label";
import { RichTextEditor } from "@modulocate/ui/components/rich-text-editor";
import { useTRPC } from "../trpc";
import { useProject } from "../lib/use-project";

export const Route = createFileRoute("/data/settings")({
  component: SettingsPage,
});

type FormState = {
  votingInviteIntro: string;
  votingResultsIntro: string;
  welcomeText: string;
};

const EMPTY_FORM: FormState = { votingInviteIntro: "", votingResultsIntro: "", welcomeText: "" };

function SettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { projectId } = useProject();
  const { data } = useQuery({
    ...trpc.settings.get.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  // Seeds the form once per project switch — keyed on projectId (not on
  // `data` itself) so the background refetch after a successful save doesn't
  // clobber further edits the user made in the meantime.
  const initializedForProject = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!data || !projectId) return;
    if (initializedForProject.current === projectId) return;
    initializedForProject.current = projectId;
    setForm(data);
  }, [data, projectId]);

  const updateSettings = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey({ projectId }) });
        setSuccess("Gespeichert.");
      },
      onError: (err) => setError(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSuccess(undefined);
    if (!projectId) return;
    updateSettings.mutate({ projectId, ...form });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Einstellungen</h2>

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-voting-invite-intro">Einladungs-E-Mail — Einleitungstext</Label>
          <RichTextEditor
            id="settings-voting-invite-intro"
            value={form.votingInviteIntro}
            onChange={(votingInviteIntro) => setForm({ ...form, votingInviteIntro })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-voting-results-intro">Ergebnis-E-Mail — Einleitungstext</Label>
          <RichTextEditor
            id="settings-voting-results-intro"
            value={form.votingResultsIntro}
            onChange={(votingResultsIntro) => setForm({ ...form, votingResultsIntro })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-welcome-text">Begrüßungstext in der Umfrage</Label>
          <RichTextEditor
            id="settings-welcome-text"
            value={form.welcomeText}
            onChange={(welcomeText) => setForm({ ...form, welcomeText })}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && !error && <p className="text-sm text-success">{success}</p>}

        <div>
          <Button type="submit" disabled={!projectId || updateSettings.isPending}>
            Speichern
          </Button>
        </div>
      </form>
    </div>
  );
}
