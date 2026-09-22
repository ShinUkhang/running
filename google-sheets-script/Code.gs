/**
 * 학생 러닝앱 구글 스프레드시트 연동 스크립트 (Google Apps Script)
 * 
 * [배포 방법 - 1분 소요]
 * 1. 스프레드시트 메뉴에서 [확장 프로그램] -> [Apps Script] 클릭
 * 2. 기존 내용을 모두 지우고 이 코드 전체를 붙여넣기
 * 3. 오른쪽 상단 파란색 [배포] -> [새 배포] 클릭
 * 4. 유형 선택: [웹 앱] 선택
 * 5. 설명: "러닝앱 연동 v1" 입력
 * 6. 다음 사용자로 실행: "나(내 계정)" 선택
 * 7. 액세스 권한: "모든 사용자(Anyone)" 선택 (중요: 학생 로그인 없이 전송하기 위해 필수)
 * 8. [배포] 클릭 후 나오는 [웹 앱 URL]을 복사하여 러닝앱 설정에 붙여넣으면 완료!
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = {};
    
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    }

    var name = data.name || "미입력";
    var studentClass = data.studentClass || data.class || "1-1";
    var sport = data.sport || "러닝";
    var startTime = data.startTime || "";
    var endTime = data.endTime || "";
    var duration = data.duration || "";
    var distance = data.distance || "0.0 km";
    var calories = data.calories || "0 kcal";
    var pace = data.pace || "--:--";

    // 12행부터 데이터가 시작되므로, 시트의 마지막 행을 찾아 추가합니다.
    var lastRow = sheet.getLastRow();
    var targetRow = Math.max(lastRow + 1, 12);

    // 컬럼 매핑:
    // B열: 이름, C열: 학급, D열: 종목, E열: 출발시간, F열: 종료시간,
    // G열: 운동시간, H열: 거리, I열: 소모열량, J열: 페이스
    var rowData = [
      "",             // A열 (공백)
      name,           // B열 (이름)
      studentClass,   // C열 (학급)
      sport,          // D열 (종목)
      startTime,      // E열 (출발시간)
      endTime,        // F열 (종료시간)
      duration,       // G열 (운동시간)
      distance,       // H열 (거리)
      calories,       // I열 (소모열량)
      pace            // J열 (페이스)
    ];

    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);

    // 성공 응답 반환
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "성공적으로 스프레드시트에 저장되었습니다.",
      row: targetRow,
      data: data
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    
    if (lastRow < 12) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        records: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var range = sheet.getRange(12, 1, lastRow - 11, 10);
    var values = range.getValues();
    
    var records = values.map(function(row) {
      return {
        name: row[1],
        studentClass: row[2],
        sport: row[3],
        startTime: row[4],
        endTime: row[5],
        duration: row[6],
        distance: row[7],
        calories: row[8],
        pace: row[9]
      };
    }).filter(function(item) {
      return item.name && item.name !== "";
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: records.length,
      records: records
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
