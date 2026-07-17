export function votingInviteTemplate(params: { studentName: string; voteLink: string }) {
  return {
    subject: "Deine Wahl für die Module",
    html: `<p>Hallo ${params.studentName},</p>
<p>bitte gib deine Modulwahl über folgenden Link ab:</p>
<p><a href="${params.voteLink}">${params.voteLink}</a></p>`,
  };
}
