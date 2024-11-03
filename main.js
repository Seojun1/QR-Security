window.ENV = {
    API_KEY: '',
    API_URL: ''
};


// URL 안전성 검사 함수
async function checkUrlSafety(url) {
    const API_KEY = config.API_KEY;
    const BASE_API_URL = config.API_URL;
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
    lastResult: null, // 마지막 스캔 결과 저장
    lastScanTime: 0,  // 마지막 스캔 시간 저장

    async init() {
        try {
            this.video = document.getElementById('qr-video');
            this.canvas = document.getElementById('qr-canvas');

            if (!this.video || !this.canvas) {
                console.error('필요한 DOM 요소를 찾을 수 없습니다.');
                return;
            }

            this.ctx = this.canvas.getContext('2d');

            // 이전 스트림이 있다면 정리
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }

            // 카메라 권한 요청 및 스트림 획득
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            if (this.video) {
                this.video.srcObject = this.mediaStream;
                this.video.setAttribute('playsinline', true);

                await this.video.play();

                await new Promise((resolve) => {
                    this.video.onloadedmetadata = () => {
                        this.canvas.width = this.video.videoWidth;
                        this.canvas.height = this.video.videoHeight;
                        resolve();
                    };
                });

                this.scanning = true;
                this.scan();
            }
        } catch (error) {
            console.error('카메라 접근 오류:', error);
            this.handleCameraError(error);
        }
    },

    handleCameraError(error) {
        const errorElement = document.getElementById('qr-reader');
        if (errorElement) {
            let errorMessage = '카메라 접근에 실패했습니다. ';

            switch (error.name) {
                case 'NotAllowedError':
                    errorMessage += '카메라 권한을 허용해주세요.';
                    break;
                case 'NotFoundError':
                    errorMessage += '사용 가능한 카메라를 찾을 수 없습니다.';
                    break;
                case 'AbortError':
                    errorMessage += '카메라 초기화가 중단되었습니다. 페이지를 새로고침해주세요.';
                    break;
                default:
                    errorMessage += '다시 시도해주세요.';
            }

            errorElement.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--error);">
                    <p>${errorMessage}</p>
                    <button onclick="retryCamera()" 
                            style="margin-top: 1rem; padding: 0.5rem 1rem; 
                                   background: var(--primary); color: white; 
                                   border: none; border-radius: 0.5rem; 
                                   cursor: pointer;">
                        다시 시도
                    </button>
                </div>
            `;
        }
    },
    scan() {
        if (!this.scanning || !this.video || !this.canvas || !this.ctx) return;

        try {
            if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
                this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
                const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

                try {
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code) {
                        const currentTime = Date.now();
                        // 동일한 QR 코드는 3초 간격으로만 처리
                        if (this.lastResult !== code.data || currentTime - this.lastScanTime > 3000) {
                            this.lastResult = code.data;
                            this.lastScanTime = currentTime;
                            this.handleSuccess(code.data);
                        }
                    }
                } catch (e) {
                    console.error('QR 코드 스캔 오류:', e);
                }
            }

            // 스캔 계속 진행
            requestAnimationFrame(() => this.scan());
        } catch (error) {
            console.error('스캔 중 오류:', error);
            if (this.scanning) {
                requestAnimationFrame(() => this.scan());
            }
        }
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
                description = `위험 유형: ${safetyResult.threatType}`;
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

            // 스캐닝 계속 유지
            this.scanning = true;
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

            // 에러 발생해도 스캐닝 유지
            this.scanning = true;
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

    cleanup() {
        this.scanning = false;
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.lastResult = null;
        this.lastScanTime = 0;
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
                    await this.handleSuccess(result);
                } catch (error) {
                    this.handleError(error.message);
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
                    await this.handleSuccess(result);
                } catch (error) {
                    this.handleError(error.message);
                }
            }
        });
    }
};

// 유틸리티 함수들
function closeModal() {
    const modal = document.getElementById('resultModal');
    modal.classList.remove('show');
    // 모달을 닫아도 스캐너는 계속 작동
    qrScanner.scanning = true;
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

function retryCamera() {
    qrScanner.cleanup();
    qrScanner.init();
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
                qrScanner.cleanup();
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