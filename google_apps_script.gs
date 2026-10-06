// Davomat tizimi uchun Google Sheets webhook.
// Deploy -> New deployment -> Web app -> Execute as: Me -> Who has access: Anyone
// /exec URL ni dasturdagi .env faylida GOOGLE_SHEETS_WEBHOOK ga yozing.

function doPost(e) {
  const data = JSON.parse(e.postData.contents || '{}');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Davomat');
  if (!sh) sh = ss.insertSheet('Davomat');

  const headers = ['Record ID','Xodim ism familiyasi','Bo‘lim','Lavozim','Izoh','Lokatsiya','Yuborgan sana','Tasdiqlangan vaqt','Holat','Admin izohi','Ishxona yaqinida'];
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1,1,1,headers.length).setBackground('#fff200').setFontWeight('bold');
  } else if (sh.getRange(1,1).getValue() !== 'Record ID') {
    // Eski jadval bo‘lsa, yangi ustunlar bilan xavfsiz yangi varaq ochiladi.
    let upgraded = ss.getSheetByName('Davomat_yangi');
    if (!upgraded) upgraded = ss.insertSheet('Davomat_yangi');
    sh = upgraded;
    if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      sh.getRange(1,1,1,headers.length).setBackground('#fff200').setFontWeight('bold');
    }
  }

  const mapFormula = '=HYPERLINK("' + data.maps_url + '","' + data.latitude + ', ' + data.longitude + '")';
  const rowValues = [data.record_id,data.full_name,data.department||'',data.position||'',data.note,mapFormula,data.sent_at,data.confirmed_at||'',data.status,data.admin_note||'',data.office_match ? 'Ha' : 'Yo‘q'];

  if (data.action === 'update') {
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      const ids = sh.getRange(2,1,lastRow-1,1).getValues();
      for (let i=0; i<ids.length; i++) {
        if (String(ids[i][0]) === String(data.record_id)) {
          sh.getRange(i+2,1,1,rowValues.length).setValues([rowValues]);
          return ContentService.createTextOutput(JSON.stringify({ok:true,updated:true})).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
  }

  sh.appendRow(rowValues);
  return ContentService.createTextOutput(JSON.stringify({ok:true,updated:false})).setMimeType(ContentService.MimeType.JSON);
}
