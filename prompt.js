export function buildPrompt(input, caseData) {
  return `
당신은 초등학교 SW·AI 활용 수업 설계 전문가이다.
업로드된 교과별 상세 사례의 구조와 수준을 유지하면서 새 수업 초안을 작성한다.

[입력]
교과: ${input.subject || caseData.meta.subject}
학년: ${input.grade || "5~6학년"}
차시: ${input.lessonCount || caseData.meta.lessonCount}
주제: ${input.title || caseData.meta.title}
추가 조건: ${input.constraints || "없음"}
설계 사용자: ${input.userName || "교사"}

[참고 교과 사례]
성취기준: ${caseData.meta.standard}
주요 산출물: ${caseData.meta.output}
7단계 사례:
${caseData.steps.map(s=>`${s.id}. ${s.name}\n${s.items.map(i=>`- ${i.label}: ${i.content}`).join("\n")}`).join("\n")}

[작성 조건]
- 7단계와 각 단계의 항목명·항목 수를 참고 사례와 정확히 같게 유지한다.
- 새 주제에 맞게 내용만 새로 작성한다.
- 학생의 문제해결 행동과 의사소통 행동을 구체적으로 쓴다.
- AI는 학생 사고를 대신하지 않고 초안·비교·검증을 돕도록 한다.
- 개인정보, 안전, 저작권 유의사항을 포함한다.
- meta의 output, standard, standardUrl도 작성한다.
JSON만 출력한다.
`;
}
