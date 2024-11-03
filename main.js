// URL 안전성 검사 함수
async function checkUrlSafety(url) {
    const API_KEY = "";
    const BASE_API_URL = "";
    const encodedUrl = encodeURIComponent(url);
    const apiUrl = `${BASE_API_URL}?key=${API_KEY}&url=${encodedUrl}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('API 요청 실패');
        }

        const data = await response.json();

        if (data.message === "SUCCESS" && data.result) {
            return {
                isSafe: data.result.safe === "1",
                threatType: data.result.threat || "알 수 없음",
                originalResponse: data
            };
        } else {
            throw new Error('잘못된 API 응답 형식');
        }
    } catch (error) {
        console.error('URL 검사 중 오류:', error);
        throw error;
    }
}

// QR 스캐너 객체
const qrScanner = {
    video: null,
    canvas: null,
    ctx: null,
    scanning: false,
    mediaStream: null,

    async init() {
        this.video = document.getElementById('qr-video');
        this.canvas = document.getElementById('qr-canvas');
        this.ctx = this.canvas.getContext('2d');

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });

            this.video.srcObject = this.mediaStream;
            this.video.setAttribute('playsinline', true);
            await this.video.play();

            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            this.scanning = true;
            this.scan();
        } catch (error) {
            console.error('카메라 접근 오류:', error);
            document.getElementById('qr-reader').innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--error);">
                    카메라 접근이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.
                </div>
            `;
        }
    },

    scan() {
        if (!this.scanning) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    this.handleSuccess(code.data);
                    return;
                }
            } catch (e) {
                console.error('QR 코드 스캔 오류:', e);
            }
        }

        requestAnimationFrame(() => this.scan());
    },

    async handleSuccess(decodedText) {
        const modal = document.getElementById('resultModal');
        const modalContent = modal.querySelector('.modal-content');

        // 로딩 상태 표시
        modalContent.innerHTML = `
            <div class="modal-loading">
                <div class="loading-spinner"></div>
                <p>URL 안전성을 검사하고 있습니다...</p>
            </div>
        `;
        modal.classList.add('show');

        try {
            const safetyResult = await checkUrlSafety(decodedText);
            let modalClass = '';
            let icon = '';
            let title = '';
            let description = '';
            let tips = [];
            let resultClass = '';
            let actionButtons = '';

            if (safetyResult.isSafe) {
                modalClass = 'modal-safe';
                resultClass = 'result-safe';
                icon = '✓';
                title = '안전한 URL';
                description = '안전한 것으로 확인된 URL입니다';
                tips = [
                    '안전성이 확인되었습니다',
                    '일반적인 주의사항을 지켜주세요',
                    '민감한 정보 입력 시에는 항상 주의하세요'
                ];
                actionButtons = `
                    <button onclick="window.open('${decodedText}', '_blank')" class="action-btn visit-btn">
                        방문하기
                    </button>
                `;
            } else {
                modalClass = 'modal-danger';
                resultClass = 'result-danger';
                icon = '⚠️';
                title = '위험 감지';
                tips = [
                    '이 URL은 위험한 것으로 확인되었습니다',
                    '접속하지 않는 것을 강력히 권장합니다',
                    '개인정보를 절대 입력하지 마세요'
                ];
                actionButtons = `
                    <button onclick="closeModal()" class="action-btn close-btn">
                        닫기
                    </button>
                `;
            }

            modalContent.innerHTML = `
                <div class="${modalClass}">
                    <div class="modal-icon">${icon}</div>
                    <h2 class="modal-title">${title}</h2>
                    <p class="modal-description">${description}</p>
                    <div class="modal-url ${resultClass}">
                        <span class="url-text">${decodedText}</span>
                        <button onclick="copyToClipboard('${decodedText}')" class="copy-btn">
                            복사
                        </button>
                    </div>
                    <div class="modal-tips">
                        <h4>💡 안전 팁</h4>
                        <ul>
                            ${tips.map(tip => `<li>${tip}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="modal-actions">
                        ${actionButtons}
                    </div>
                    <div class="modal-details">
                        <button onclick="toggleDetails()" class="details-toggle">
                            상세 검사 결과 보기
                        </button>
                        <div class="details-content" style="display: none;">
                            <pre>${JSON.stringify(safetyResult.originalResponse, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            `;

        } catch (error) {
            modalContent.innerHTML = `
                <div class="modal-warning">
                    <div class="modal-icon">!</div>
                    <h2 class="modal-title">검사 실패</h2>
                    <p class="modal-description">URL 안전성 검사 중 오류가 발생했습니다</p>
                    <div class="modal-url">${decodedText}</div>
                    <div class="modal-tips">
                        <h4>💡 권장 사항</h4>
                        <ul>
                            <li>인터넷 연결을 확인해주세요</li>
                            <li>잠시 후 다시 시도해주세요</li>
                            <li>문제가 지속되면 관리자에게 문의하세요</li>
                        </ul>
                    </div>
                    <div class="modal-actions">
                        <button onclick="retryScanning()" class="action-btn retry-btn">
                            다시 시도
                        </button>
                    </div>
                </div>
            `;
        }

        this.scanning = false;
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
    },

    restart() {
        if (!this.scanning) {
            this.scanning = true;
            this.init();
        }
    },

    async processQRFromFile(file) {
        return new Promise((resolve, reject) => {
            if (typeof jsQR === 'undefined') {
                reject(new Error('QR 스캔 라이브러리가 로드되지 않았습니다.'));
                return;
            }

            if (!file || !file.type.startsWith('image/')) {
                reject(new Error('유효하지 않은 이미지 파일입니다.'));
                return;
            }

            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const img = new Image();

                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const MAX_SIZE = 1024;
                        let width = img.width;
                        let height = img.height;

                        if (width > height && width > MAX_SIZE) {
                            height = height * (MAX_SIZE / width);
                            width = MAX_SIZE;
                        } else if (height > MAX_SIZE) {
                            width = width * (MAX_SIZE / height);
                            height = MAX_SIZE;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);
                        const imageData = ctx.getImageData(0, 0, width, height);
                        const code = jsQR(imageData.data, imageData.width, imageData.height);

                        if (code) {
                            resolve(code.data);
                        } else {
                            reject(new Error('QR 코드를 찾을 수 없습니다.'));
                        }
                    };

                    img.onerror = () => {
                        reject(new Error('이미지 로드 중 오류가 발생했습니다.'));
                    };

                    img.src = e.target.result;

                } catch (error) {
                    reject(new Error('이미지 처리 중 오류가 발생했습니다.'));
                }
            };

            reader.onerror = () => {
                reject(new Error('파일 읽기 중 오류가 발생했습니다.'));
            };

            reader.readAsDataURL(file);
        });
    },

    async displayFileUploadResult(result, error = null) {
        if (error) {
            this.handleError(error.message);
            return;
        }
        await this.handleSuccess(result);
    },

    handleError(errorMessage) {
        const modal = document.getElementById('resultModal');
        const modalContent = modal.querySelector('.modal-content');

        modalContent.innerHTML = `
            <div class="modal-warning">
                <div class="modal-icon">!</div>
                <h2 class="modal-title">오류 발생</h2>
                <p class="modal-description">${errorMessage}</p>
                <div class="modal-tips">
                    <h4>💡 문제 해결 팁</h4>
                    <ul>
                        <li>이미지가 선명한지 확인해주세요</li>
                        <li>QR 코드가 이미지 안에 완전히 포함되어 있는지 확인해주세요</li>
                        <li>다른 이미지로 다시 시도해보세요</li>
                    </ul>
                </div>
                <div class="modal-actions">
                    <button onclick="retryScanning()" class="action-btn retry-btn">
                        다시 시도
                    </button>
                </div>
            </div>
        `;

        modal.classList.add('show');
    },

    initFileUpload() {
        const fileInput = document.getElementById('qr-input-file');
        const dropZone = document.getElementById('file-upload-region');
        const uploadBtn = document.querySelector('.upload-btn');

        uploadBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput?.click();
        });

        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (file) {
                try {
                    const result = await this.processQRFromFile(file);
                    await this.displayFileUploadResult(result);
                } catch (error) {
                    this.displayFileUploadResult(null, error);
                }
            }
        });

        dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone?.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone?.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');

            const file = e.dataTransfer.files?.[0];
            if (file) {
                try {
                    const result = await this.processQRFromFile(file);
                    await this.displayFileUploadResult(result);
                } catch (error) {
                    this.displayFileUploadResult(null, error);
                }
            }
        });
    }
};

// 유틸리티 함수들
function closeModal() {
    const modal = document.getElementById('resultModal');
    modal.classList.remove('show');
    qrScanner.restart();
}

function toggleDetails() {
    const detailsContent = document.querySelector('.details-content');
    const toggleButton = document.querySelector('.details-toggle');

    if (detailsContent.style.display === 'none') {
        detailsContent.style.display = 'block';
        toggleButton.textContent = '상세 정보 닫기';
    } else {
        detailsContent.style.display = 'none';
        toggleButton.textContent = '상세 검사 결과 보기';
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert('URL이 클립보드에 복사되었습니다.');
    } catch (err) {
        console.error('클립보드 복사 실패:', err);
        alert('클립보드 복사에 실패했습니다.');
    }
}

function retryScanning() {
    closeModal();
    qrScanner.restart();
}

// 이벤트 리스너들
document.addEventListener('DOMContentLoaded', () => {
    function initializeScanner() {
        if (typeof jsQR === 'undefined') {
            console.log('jsQR 라이브러리 로드 중...');
            setTimeout(initializeScanner, 1000);
            return;
        }

        console.log('jsQR 라이브러리 로드 완료');

        // QR 스캐너 초기화
        qrScanner.init();

        // 스캔 방식 전환 로직
        const methodButtons = document.querySelectorAll('.scan-method-btn');
        const scanRegion = document.getElementById('scan-region');
        const fileUploadRegion = document.getElementById('file-upload-region');
        const cameraInstructions = document.getElementById('camera-instructions');
        const uploadInstructions = document.getElementById('upload-instructions');

        // 스캔 방식 전환 함수
        function switchMethod(method) {
            methodButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.method === method);
            });

            if (method === 'camera') {
                scanRegion.style.display = 'block';
                fileUploadRegion.style.display = 'none';
                cameraInstructions.style.display = 'block';
                uploadInstructions.style.display = 'none';
                qrScanner.init();
            } else {
                scanRegion.style.display = 'none';
                fileUploadRegion.style.display = 'block';
                cameraInstructions.style.display = 'none';
                uploadInstructions.style.display = 'block';
                if (qrScanner.mediaStream) {
                    qrScanner.mediaStream.getTracks().forEach(track => track.stop());
                }
            }
        }

        // 방식 전환 버튼 이벤트 리스너
        methodButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchMethod(btn.dataset.method);
            });
        });

        // 파일 업로드 기능 초기화
        qrScanner.initFileUpload();

        // 링크 스크롤 애니메이션
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // Scanner 초기화 시작
    initializeScanner();
});

// ESC 키로 모달 닫기
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// 모달 외부 클릭으로 닫기
document.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeModal();
    }
});

// 추가 스타일 삽입
const additionalStyles = `
.loading-spinner {
    width: 50px;
    height: 50px;
    border: 5px solid var(--gray-200);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
}

.modal-loading {
    text-align: center;
    padding: 2rem;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.modal-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
    justify-content: center;
}

.action-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
}

.visit-btn {
    background: var(--success);
    color: white;
}

.visit-btn:hover {
    background: var(--success-dark);
}

.close-btn {
    background: var(--error);
    color: white;
}

.close-btn:hover {
    background: var(--error-dark);
}

.retry-btn {
    background: var(--primary);
    color: white;
}

.retry-btn:hover {
    background: var(--primary-dark);
}

.copy-btn {
    padding: 0.25rem 0.75rem;
    background: var(--gray-100);
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
}

.copy-btn:hover {
    background: var(--gray-200);
}

.modal-url {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin: 1rem 0;
    word-break: break-all;
    font-family: monospace;
}

.url-text {
    flex: 1;
}

.result-safe {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
}

.result-danger {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
}

.details-toggle {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--gray-100);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    color: var(--gray-600);
    transition: all 0.2s ease;
}

.details-toggle:hover {
    background: var(--gray-200);
}

.details-content {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--gray-50);
    border-radius: 0.5rem;
    font-family: monospace;
    font-size: 0.9rem;
    overflow-x: auto;
}

.details-content pre {
    margin: 0;
    white-space: pre-wrap;
}

@media (max-width: 768px) {
    .modal-container {
        width: 95%;
        margin: 1rem;
        max-height: 90vh;
        overflow-y: auto;
    }

    .modal-actions {
        flex-direction: column;
    }

    .action-btn {
        width: 100%;
    }
}
`;

// 스타일 추가
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// FAQ 아코디언
document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => {
        const faqItem = button.parentElement;
        const isActive = faqItem.classList.contains('active');

        document.querySelectorAll('.faq-item').forEach(item => {
            item.classList.remove('active');
        });

        if (!isActive) {
            faqItem.classList.add('active');
        }
    });
});

// 스크롤 이벤트
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.nav');
    if (window.scrollY > 10) {
        nav.classList.add('nav-scrolled');
    } else {
        nav.classList.remove('nav-scrolled');
    }
});

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 라이브러리 로드 확인 및 재시도
    function initializeScanner() {
        if (typeof jsQR === 'undefined') {
            console.log('jsQR 라이브러리 로드 중...');
            // 1초 후 재시도
            setTimeout(initializeScanner, 1000);
            return;
        }

        console.log('jsQR 라이브러리 로드 완료');

        // QR 스캐너 초기화
        qrScanner.init();

        // 스캔 방식 전환 로직
        const methodButtons = document.querySelectorAll('.scan-method-btn');
        const scanRegion = document.getElementById('scan-region');
        const fileUploadRegion = document.getElementById('file-upload-region');
        const cameraInstructions = document.getElementById('camera-instructions');
        const uploadInstructions = document.getElementById('upload-instructions');

        // 스캔 방식 전환 함수
        function switchMethod(method) {
            methodButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.method === method);
            });

            if (method === 'camera') {
                scanRegion.style.display = 'block';
                fileUploadRegion.style.display = 'none';
                cameraInstructions.style.display = 'block';
                uploadInstructions.style.display = 'none';
                qrScanner.init();
            } else {
                scanRegion.style.display = 'none';
                fileUploadRegion.style.display = 'block';
                cameraInstructions.style.display = 'none';
                uploadInstructions.style.display = 'block';
                if (qrScanner.mediaStream) {
                    qrScanner.mediaStream.getTracks().forEach(track => track.stop());
                }
            }
        }

        // 방식 전환 버튼 이벤트 리스너
        methodButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchMethod(btn.dataset.method);
            });
        });

        // 파일 업로드 기능 초기화
        qrScanner.initFileUpload();

        // 스캔 재시작 버튼 추가
        const restartButton = document.createElement('button');
        restartButton.innerHTML = '스캔 재시작';
        restartButton.style.cssText = `
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
    `;
        restartButton.addEventListener('click', () => qrScanner.restart());
        document.getElementById('scan-result').after(restartButton);
    }

    // 초기화 시작
    initializeScanner();
});