export function votingResultsTemplate(params: { studentName: string; moduleNames: string[] }) {
  return {
    subject: "Deine Modulzuteilung",
    html: `<p>Hallo ${params.studentName},</p>
<p>dir wurden folgende Module zugeteilt:</p>
<ul>${params.moduleNames.map((name) => `<li>${name}</li>`).join("")}</ul>`,
  };
}
