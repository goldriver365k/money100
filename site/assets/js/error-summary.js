/**
 * 공통 오류 요약 상자 (UI UX Pro Max: Focusable Error Summary).
 * 오류가 2개 이상이면 폼 맨 위에 요약을 보여 주고 각 항목을 해당 입력칸으로 연결한다.
 * 칸별 오류 문구는 그대로 둔다. 1개일 때는 요약 없이 그 칸으로 바로 포커스한다.
 *
 * showErrorSummary(form, items) → 포커스할 요소를 돌려준다 (요약 상자 또는 첫 오류 칸)
 *   items: [{ target: 입력 요소, message: 문구 }]
 * hideErrorSummary(form)
 */
const ID = 'error-summary';

export function hideErrorSummary(form) {
  form.querySelector(`#${ID}`)?.remove();
}

export function showErrorSummary(form, items) {
  hideErrorSummary(form);
  const list = items.filter((x) => x && x.message);
  if (list.length < 2) return list[0]?.target ?? null;

  const box = document.createElement('div');
  box.id = ID;
  box.className = 'error-summary';
  box.tabIndex = -1;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-labelledby', `${ID}-title`);
  const title = document.createElement('p');
  title.id = `${ID}-title`;
  title.className = 'error-summary-title';
  title.textContent = `입력값 ${list.length}개를 확인해 주세요`;
  const ul = document.createElement('ul');
  list.forEach(({ target, message }) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = target?.id ? `#${target.id}` : '#';
    a.textContent = message;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      target?.focus();
    });
    li.append(a);
    ul.append(li);
  });
  box.append(title, ul);
  const anchor = form.querySelector('.panel-title');
  if (anchor) anchor.after(box); else form.prepend(box);
  return box;
}
