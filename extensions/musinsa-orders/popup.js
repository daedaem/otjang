import { readMusinsaOrderPage } from './musinsa-order-reader.js';
import { parseOrderImport, ORDER_STATUS_LABELS } from './order-contract.js';

const readButton = document.getElementById('read');
const form = document.getElementById('selection');
const rows = document.getElementById('rows');
const message = document.getElementById('message');
let payload = null;
const selectedPayload = () => {
  const selected = new Set([...rows.querySelectorAll('input:checked')].map((el) => el.value));
  const data = { ...payload, items: payload.items.filter((row) => selected.has(row.key)) };
  return parseOrderImport(JSON.stringify(data));
};
readButton.addEventListener('click', async () => {
  readButton.disabled = true;
  payload = null; rows.replaceChildren(); form.hidden = true; message.textContent = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readMusinsaOrderPage });
    const data = result[0]?.result;
    if (!data?.items?.length) throw new Error('읽을 수 있는 주문을 찾지 못했어요. 로그인 후 주문 내역을 열고, 상품과 상태가 표시되는지 확인해 주세요.');
    payload = parseOrderImport(JSON.stringify(data));
    for (const row of payload.items) {
      const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
      input.type = 'checkbox'; input.value = row.key; input.checked = row.identity === 'order';
      const title = document.createElement('b'); title.textContent = [row.brand, row.name].filter(Boolean).join(' · ');
      const details = document.createElement('small'); details.textContent = [row.orderDate || '주문일 미확인', ORDER_STATUS_LABELS[row.status], row.option || '옵션 미확인', row.amount === null ? '금액 미확인' : `화면 표시 ${row.amount.toLocaleString('ko-KR')}원`, row.identity === 'page' ? '주문번호 미확인 · 중복 가능, 직접 선택해 주세요' : ''].filter(Boolean).join(' · ');
      span.append(title, details); label.append(input, span); rows.append(label);
    }
    form.hidden = false;
    message.textContent = `${payload.items.length}개를 찾았어요. 가져올 내역만 골라 주세요. 취소·반품도 장부에 남길 수 있어요.`;
  } catch (error) { message.textContent = error.message || '주문내역을 읽지 못했어요.'; }
  finally { readButton.disabled = false; }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await navigator.clipboard.writeText(JSON.stringify(selectedPayload())); message.textContent = '선택한 내역을 복사했어요. 앱의 ‘구매내역 가져오기’에 붙여넣으세요.'; }
  catch (error) { message.textContent = error.message || '복사하지 못했어요. 파일로 받아 주세요.'; }
});
document.getElementById('download').addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify(selectedPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'musinsa.eoul-orders.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = '앱의 ‘구매내역 가져오기’에서 받은 파일을 선택해 주세요.';
  } catch (error) { message.textContent = error.message; }
});
