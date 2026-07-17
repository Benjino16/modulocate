export function passwordResetTemplate(params: { resetLink: string }) {
  return {
    subject: "Passwort zurücksetzen",
    html: `<p>Klicke auf folgenden Link, um dein Passwort zurückzusetzen:</p>
<p><a href="${params.resetLink}">${params.resetLink}</a></p>`,
  };
}
