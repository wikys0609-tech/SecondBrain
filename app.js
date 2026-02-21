document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const entryContent = document.getElementById('entry-content');
    const imageUploadArea = document.getElementById('image-upload');
    const saveBtn = document.getElementById('save-btn');
    const entryTitle = document.getElementById('entry-title');
    const categorySelect = document.getElementById('category');
    const tagsInput = document.querySelector('.tags-input input');

    // Graph Elements
    const navGraph = document.getElementById('nav-graph');
    const graphOverlay = document.getElementById('graph-overlay');
    const closeGraph = document.getElementById('close-graph');

    // Configuration
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbw_zptrrJXqcMCcyUJITlrDu45pTKxq5Bq2ERcCFpYndGzdPO2yLdq0fPsjJH09Sfc3/exec';

    // UI State
    let currentType = 'text';
    let activities = JSON.parse(localStorage.getItem('synapse_activities') || '[]');
    let userAccessKey = localStorage.getItem('synapse_key');

    // Initial Load
    checkAccess();
    renderActivities();

    // Access Control Logic
    function checkAccess() {
        if (userAccessKey) {
            document.body.classList.remove('locked');
            document.getElementById('login-gate').classList.add('hidden');
        } else {
            document.body.classList.add('locked');
            document.getElementById('login-gate').classList.remove('hidden');
        }
    }

    document.getElementById('login-btn').addEventListener('click', () => {
        const key = document.getElementById('access-key-input').value;
        if (key) {
            userAccessKey = key;
            localStorage.setItem('synapse_key', key);
            checkAccess();
        }
    });

    document.getElementById('access-key-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('login-btn').click();
    });

    // Graph Overlay Control
    navGraph.addEventListener('click', (e) => {
        e.preventDefault();
        graphOverlay.classList.remove('hidden');
        synapseGraph.update(activities);
    });

    closeGraph.addEventListener('click', () => {
        graphOverlay.classList.add('hidden');
    });

    // Wikilink Extraction Helper
    function extractWikilinks(text) {
        const regex = /\[\[(.*?)\]\]/g;
        const links = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            links.push(match[1]);
        }
        return links;
    }

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.getAttribute('data-type');

            if (currentType === 'image') {
                entryContent.classList.add('hidden');
                imageUploadArea.classList.remove('hidden');
            } else {
                entryContent.classList.remove('hidden');
                imageUploadArea.classList.add('hidden');

                if (currentType === 'link') {
                    entryContent.placeholder = "URL 주소를 붙여넣으세요 (예: https://...)";
                } else {
                    entryContent.placeholder = "이곳에 내용을 입력하거나 링크를 붙여넣으세요...";
                }
            }
        });
    });

    // Save Logic
    saveBtn.addEventListener('click', async () => {
        const titleValue = entryTitle.value.trim();
        const contentValue = entryContent.value.trim();

        const data = {
            accessKey: userAccessKey, // 액세스 키 포함
            title: titleValue || (currentType === 'link' ? '웹 링크' : '새 노트'),
            content: contentValue,
            type: currentType,
            category: categorySelect.value,
            tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(t => t !== ''),
            wikilinks: extractWikilinks(contentValue),
            timestamp: new Date().toLocaleString('ko-KR')
        };

        if (!data.content && currentType !== 'image') {
            alert('내용을 입력해 주세요.');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 시냅스 연결 중...';

        try {
            // 1. Local Storage 저장 (데모 및 백업용)
            activities.unshift(data);
            if (activities.length > 10) activities.pop(); // 최대 10개 유지
            localStorage.setItem('synapse_activities', JSON.stringify(activities));
            renderActivities();

            // 2. 실제 GAS API 호출 (URL이 설정된 경우에만)
            if (GAS_URL !== 'YOUR_GAS_WEB_APP_URL_HERE') {
                const response = await fetch(GAS_URL, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                console.log('GAS Response:', result);

                if (result.status === 'success') {
                    // AI가 생성한 요약과 실제 카테고리로 업데이트
                    activities[0].summary = result.data.summary;
                    activities[0].category = result.data.category;
                    localStorage.setItem('synapse_activities', JSON.stringify(activities));
                    renderActivities();
                }
            } else {
                // 데모 모드 (기존 3줄 추출 방식 사용)
                activities[0].summary = data.content.split(/[.!?\n]/).slice(0, 2).join('. ') + '... (AI 연동 대기 중)';
                localStorage.setItem('synapse_activities', JSON.stringify(activities));
                renderActivities();
                console.log('Demo mode: Data saved locally. Configure GAS_URL for cloud sync.');
                await new Promise(r => setTimeout(r, 800));
            }

            showSuccess('지식이 시냅스에 성공적으로 기록되었습니다!');
            clearForm();
        } catch (error) {
            console.error('Error saving:', error);
            showError('저장 중 오류가 발생했습니다. 로컬에는 저장되었습니다.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 시냅스 저장';
        }
    });

    // Recent Activity Rendering
    function renderActivities() {
        const list = document.getElementById('recent-activity');
        if (activities.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>아직 저장된 기록이 없습니다.</p></div>';
            return;
        }

        list.innerHTML = activities.map(act => `
            <div class="activity-item">
                <div class="act-icon ${act.type}">
                    <i class="fas ${act.type === 'text' ? 'fa-file-alt' : act.type === 'link' ? 'fa-link' : 'fa-image'}"></i>
                </div>
                <div class="act-details">
                    <div class="act-header">
                        <h4>${act.title}</h4>
                        <span class="category-tag">${act.category}</span>
                    </div>
                    ${act.summary ? `<div class="act-summary"><i class="fas fa-magic"></i> ${act.summary}</div>` : ''}
                    <p class="act-time">${act.timestamp}</p>
                </div>
            </div>
        `).join('');
    }

    // Image Upload Click Trigger
    imageUploadArea.addEventListener('click', () => {
        document.getElementById('image-input').click();
    });

    // Helper Functions
    function showSuccess(msg) {
        alert(msg); // Will replace with a custom toast in Phase 2
    }

    function showError(msg) {
        alert(msg);
    }

    function clearForm() {
        entryTitle.value = '';
        entryContent.value = '';
        tagsInput.value = '';
    }
});
