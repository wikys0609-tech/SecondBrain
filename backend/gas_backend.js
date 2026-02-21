/**
 * My Digital Synapse - GAS Backend Bridge
 * 
 * 설정 방법:
 * 1. script.google.com 접속
 * 2. 새 프로젝트 생성 후 이 코드를 붙여넣기
 * 3. '배포' -> '새 배포' -> '웹 앱' 선택
 * 4. 액세스 권한을 '모든 사용자(Anyone)'로 설정하여 배포
 * 5. 웹 앱 URL을 프론트엔드의 app.js에 상수로 입력
 */

const SPREADSHEET_ID = '1aoEv9SFB4t86N4LroV5kmRiEv_Rk8vbknkcFch66NKo';
const ROOT_FOLDER_ID = '1y62LF9cmyTiH8GE3g8ClIhTFqAdDknA9';
const GEMINI_API_KEY = 'AIzaSyDNf-p7d0to2CPdPGExufCRrAhQ1VbjPTc';
const ACCESS_KEY = '1234'; // TODO: 원하는 비밀번호로 변경하세요

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);

        // 보안 검증: 액세스 키 확인
        if (data.accessKey !== ACCESS_KEY) {
            return ContentService.createTextOutput(JSON.stringify({
                status: 'error',
                message: 'Unauthorized: Invalid Access Key'
            })).setMimeType(ContentService.MimeType.JSON);
        }

        const result = processSync(data);

        return ContentService.createTextOutput(JSON.stringify({
            status: 'success',
            data: result
        })).setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: error.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function processSync(payload) {
    const { title, content, type, category, tags, timestamp } = payload;

    // 1. 지능형 분류 (분야가 'auto'일 경우)
    let finalCategory = category;
    let aiAnalysis = { summary: '', tags: [], category: '' };

    if (type !== 'image') {
        aiAnalysis = fetchAiAnalysis(content || title);
    }

    if (category === 'auto') {
        finalCategory = aiAnalysis.category || '기타';
    }

    // 2. 카테고리 폴더 확인 및 생성
    const categoryFolder = getOrCreateFolder(finalCategory, ROOT_FOLDER_ID);

    let fileUrl = '';
    let finalSummary = aiAnalysis.summary || generateSimpleSummary(content);

    // 3. 타입별 처리
    if (type === 'text' || type === 'link') {
        const fileName = `${formatDate(new Date())}_${title || '무제'}.txt`;
        const fileContent = `제목: ${title}\n날짜: ${timestamp}\n분류: ${finalCategory}\n태그: ${tags.join(', ')}\n\n내용:\n${content}\n\nAI 요약:\n${finalSummary}`;
        const file = categoryFolder.createFile(fileName, fileContent);
        fileUrl = file.getUrl();
    }

    // 4. 구글 시트 인덱싱
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
    sheet.appendRow([
        timestamp,
        finalCategory,
        title || '무제',
        type,
        finalSummary,
        fileUrl || content,
        tags.concat(aiAnalysis.tags || []).join(', '),
        (payload.wikilinks || []).join(', ') // 새로 추가된 위키링크 컬럼
    ]);

    return { fileUrl, summary: finalSummary, category: finalCategory };
}

/**
 * Gemini API를 이용한 텍스트 분석 (요약, 키워드, 카테고리)
 */
function fetchAiAnalysis(text) {
    if (!text || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        return { summary: '', tags: [], category: '자동 분류 미지원' };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `
    다음 텍스트를 분석하여 JSON 형식으로 반환해줘.
    - summary: 핵심 내용을 3줄 이내로 한국어로 요약.
    - tags: 관련 키워드 3개를 배열로 추출.
    - category: 다음 중 가장 적합한 하나를 선택하거나, 없으면 새로운 단어를 생성해줘 (Pixel Rest, 재무, AI 강의, 업무, 개인, 생각, 기타).

    텍스트:
    "${text}"
  `;

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        const responseText = response.getContentText();
        const json = JSON.parse(responseText);

        if (!json.candidates || !json.candidates[0].content.parts[0].text) {
            throw new Error('Invalid response from Gemini API');
        }

        const aiText = json.candidates[0].content.parts[0].text;
        console.log('AI Response:', aiText);

        // JSON 문자열만 추출 (코드 블록이나 잡다한 텍스트 제거)
        const jsonStart = aiText.indexOf('{');
        const jsonEnd = aiText.lastIndexOf('}') + 1;

        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = aiText.substring(jsonStart, jsonEnd);
            return JSON.parse(jsonStr);
        }
    } catch (e) {
        console.error('AI Analysis Error: ' + e);
    }

    return { summary: '분석 중 오류가 발생했습니다. API 키나 권한을 확인해 주세요.', tags: [], category: '분류 실패' };
}

/**
 * 간단한 3줄 요약 생성 (Phase 2에서 AI 연동 가능)
 */
function generateSimpleSummary(text) {
    if (!text) return '요약 없음';
    const sentences = text.split(/[.!?\n]/).filter(s => s.trim().length > 0);
    return sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '...' : '');
}

/**
 * 폴더가 없으면 생성하고 있으면 반환
 */
function getOrCreateFolder(folderName, parentId) {
    const parent = DriveApp.getFolderById(parentId);
    const folders = parent.getFoldersByName(folderName);

    if (folders.hasNext()) {
        return folders.next();
    } else {
        return parent.createFolder(folderName);
    }
}

function formatDate(date) {
    return Utilities.formatDate(date, "GMT+9", "yyyyMMdd_HHmm");
}

// CORS 대응을 위한 doGet (Options 요청 대응)
function doGet(e) {
    return ContentService.createTextOutput("GAS Bridge is Active.");
}
