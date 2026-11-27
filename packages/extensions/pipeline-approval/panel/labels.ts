const english = ['Refresh', 'Older requests', 'Review with passkey', 'Open session', 'No approval requests', 'Approval service unavailable', 'Pending', 'Approved', 'Rejected', 'Superseded', 'Expired'];

const labels = new Map<string, string[]>([
  ['de', ['Aktualisieren', 'Ältere Anfragen', 'Mit Passkey prüfen', 'Sitzung öffnen', 'Keine Freigabeanfragen', 'Freigabedienst nicht verfügbar', 'Offen', 'Genehmigt', 'Abgelehnt', 'Ersetzt', 'Abgelaufen']],
  ['fr', ['Actualiser', 'Demandes précédentes', 'Vérifier avec une clé d’accès', 'Ouvrir la session', 'Aucune demande d’approbation', 'Service d’approbation indisponible', 'En attente', 'Approuvé', 'Refusé', 'Remplacé', 'Expiré']],
  ['nl', ['Vernieuwen', 'Oudere verzoeken', 'Beoordelen met toegangssleutel', 'Sessie openen', 'Geen goedkeuringsverzoeken', 'Goedkeuringsdienst niet beschikbaar', 'In afwachting', 'Goedgekeurd', 'Afgewezen', 'Vervangen', 'Verlopen']],
  ['zh-CN', ['刷新', '较早的请求', '使用通行密钥审核', '打开会话', '没有审批请求', '审批服务不可用', '待处理', '已批准', '已拒绝', '已替换', '已过期']],
  ['zh-TW', ['重新整理', '較早的請求', '使用通行密鑰審查', '開啟工作階段', '沒有核准請求', '核准服務無法使用', '待處理', '已核准', '已拒絕', '已取代', '已過期']],
  ['uk', ['Оновити', 'Попередні запити', 'Переглянути з ключем доступу', 'Відкрити сеанс', 'Немає запитів на погодження', 'Сервіс погодження недоступний', 'Очікує', 'Погоджено', 'Відхилено', 'Замінено', 'Строк минув']],
  ['es', ['Actualizar', 'Solicitudes anteriores', 'Revisar con clave de acceso', 'Abrir sesión', 'No hay solicitudes de aprobación', 'Servicio de aprobación no disponible', 'Pendiente', 'Aprobada', 'Rechazada', 'Sustituida', 'Caducada']],
  ['pt-BR', ['Atualizar', 'Solicitações anteriores', 'Revisar com chave de acesso', 'Abrir sessão', 'Nenhuma solicitação de aprovação', 'Serviço de aprovação indisponível', 'Pendente', 'Aprovada', 'Rejeitada', 'Substituída', 'Expirada']],
  ['ko', ['새로고침', '이전 요청', '패스키로 검토', '세션 열기', '승인 요청 없음', '승인 서비스를 사용할 수 없음', '대기 중', '승인됨', '거부됨', '대체됨', '만료됨']],
  ['pl', ['Odśwież', 'Starsze żądania', 'Sprawdź kluczem dostępu', 'Otwórz sesję', 'Brak żądań zatwierdzenia', 'Usługa zatwierdzania jest niedostępna', 'Oczekuje', 'Zatwierdzono', 'Odrzucono', 'Zastąpiono', 'Wygasło']],
  ['ja', ['更新', '過去のリクエスト', 'パスキーで確認', 'セッションを開く', '承認リクエストはありません', '承認サービスを利用できません', '保留中', '承認済み', '却下済み', '差し替え済み', '期限切れ']],
  ['tr', ['Yenile', 'Önceki istekler', 'Geçiş anahtarıyla incele', 'Oturumu aç', 'Onay isteği yok', 'Onay hizmeti kullanılamıyor', 'Beklemede', 'Onaylandı', 'Reddedildi', 'Değiştirildi', 'Süresi doldu']],
  ['ar', ['تحديث', 'الطلبات السابقة', 'مراجعة بمفتاح المرور', 'فتح الجلسة', 'لا توجد طلبات موافقة', 'خدمة الموافقة غير متاحة', 'قيد الانتظار', 'تمت الموافقة', 'مرفوض', 'مستبدل', 'منتهي الصلاحية']],
  ['he', ['רענון', 'בקשות קודמות', 'בדיקה באמצעות מפתח גישה', 'פתיחת שיחה', 'אין בקשות אישור', 'שירות האישור אינו זמין', 'ממתינה', 'אושרה', 'נדחתה', 'הוחלפה', 'פג תוקף']],
  ['ru', ['Обновить', 'Предыдущие запросы', 'Проверить с Passkey', 'Открыть сессию', 'Запросов на подтверждение нет', 'Сервис подтверждения недоступен', 'Ожидает', 'Подтверждено', 'Отклонено', 'Заменено', 'Истекло']],
]);

export function panelLabels(locale: string) {
  const [refresh, older, review, session, empty, unavailable, pending, approved, rejected, superseded, expired] = labels.get(locale) ?? english;
  return { refresh, older, review, session, empty, unavailable, decisions: { pending, approved, rejected, superseded, expired } };
}
