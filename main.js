async function checkUrlSafety(url) {
    try {
        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `${protectKey.API_URL}?key=${protectKey.API_KEY}&url=${encodedUrl}`;

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON 파싱 오류:', e);
            throw new Error('Invalid JSON response');
        }

        // API 응답 구조에 맞춰 결과 반환
        if (data.message === "SUCCESS" && data.result) {
            // safe 값을 문자열로 통일
            const safeValue = String(data.result.safe);
            return {
                safe: safeValue,
                threat: data.result.threat || null,
                originalResponse: data
            };
        } else {
            throw new Error('API 응답 형식이 올바르지 않습니다');
        }
    } catch (error) {
        console.error('URL 검사 중 상세 오류:', error);
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

    async restart() {
        // 기존 상태 초기화
        this.cleanup();

        // 스캐너 재시작
        try {
            await this.init();
        } catch (error) {
            this.handleCameraError(error);
        }
    },

    // cleanup 메서드 업데이트
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
        if (!this.scanning || !this.video || !this.canvas || !this.ctx) {
            console.log('스캔 조건이 충족되지 않음:', {
                scanning: this.scanning,
                video: !!this.video,
                canvas: !!this.canvas,
                ctx: !!this.ctx
            });
            return;
        }

        try {
            // 비디오 상태 확인 및 로깅
            console.log('비디오 상태:', {
                readyState: this.video.readyState,
                videoWidth: this.video.videoWidth,
                videoHeight: this.video.videoHeight
            });

            if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
                // 캔버스 크기가 0이 아닌지 확인
                if (this.canvas.width === 0 || this.canvas.height === 0) {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                }

                // 비디오 프레임을 캔버스에 그리기
                this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

                // 이미지 데이터 가져오기
                const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

                try {
                    // QR 코드 스캔 시도
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert"  // QR 코드 검색 최적화
                    });

                    if (code) {
                        console.log('QR 코드 발견:', code.data);
                        const currentTime = Date.now();

                        // 동일한 QR 코드는 3초 간격으로만 처리
                        if (this.lastResult !== code.data || currentTime - this.lastScanTime > 3000) {
                            this.lastResult = code.data;
                            this.lastScanTime = currentTime;
                            this.handleSuccess(code.data);
                        }
                    }
                } catch (e) {
                    console.error('QR 코드 스캔 처리 오류:', e);
                }
            }

            // 스캔 계속 진행
            if (this.scanning) {
                requestAnimationFrame(() => this.scan());
            }
        } catch (error) {
            console.error('스캔 프로세스 오류:', error);
            if (this.scanning) {
                requestAnimationFrame(() => this.scan());
            }
        }
    },

    // init 메서드도 수정
    async init() {
        try {
            this.video = document.getElementById('qr-video');
            this.canvas = document.getElementById('qr-canvas');

            if (!this.video || !this.canvas) {
                throw new Error('필요한 DOM 요소를 찾을 수 없습니다.');
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

            // 비디오 설정
            this.video.srcObject = this.mediaStream;
            this.video.setAttribute('playsinline', true);

            // 비디오 로드 및 재생 대기
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.video.play()
                        .then(() => {
                            // 캔버스 크기 설정
                            this.canvas.width = this.video.videoWidth;
                            this.canvas.height = this.video.videoHeight;
                            this.scanning = true;
                            resolve();
                        })
                        .catch(reject);
                };
                this.video.onerror = reject;
            });

            // 스캔 시작
            this.scanning = true;
            this.scan();

            console.log('카메라 초기화 완료', {
                videoWidth: this.video.videoWidth,
                videoHeight: this.video.videoHeight,
                canvasWidth: this.canvas.width,
                canvasHeight: this.canvas.height
            });
        } catch (error) {
            console.error('카메라 초기화 오류:', error);
            this.handleCameraError(error);
        }
    },

    async handleSuccess(decodedText) {
        const modal = document.getElementById('resultModal');
        const modalContent = modal.querySelector('.modal-content');

        modalContent.innerHTML = `
            <div class="modal-loading">
                <div class="loading-spinner"></div>
                <p>URL 안전성을 검사하고 있습니다...</p>
            </div>
        `;
        modal.classList.add('show');

        try {
            const safetyResult = await checkUrlSafety(decodedText);
            console.log(safetyResult);
            let modalClass = '';
            let icon = '';
            let title = '';
            let description = '';
            let tips = [];
            let resultClass = '';
            let actionButtons = '';

            // 문자열 "1" 또는 숫자 1 모두 처리
            const isSafe = String(safetyResult.safe) === "1";

            if (isSafe) {
                modalClass = 'modal-safe';
                resultClass = 'result-safe';
                icon = '✓';
                title = '안전한 URL';
                description = '이 URL은 안전한 것으로 확인되었습니다';
                tips = [
                    '검사 결과 위험 요소가 발견되지 않았습니다',
                    '일반적인 웹 브라우징 주의사항을 지켜주세요',
                    '개인정보 입력 시에는 항상 주의하세요'
                ];
                actionButtons = `
                    <div class="modal-actions">
                        <button onclick="window.open('${decodedText}', '_blank')" class="action-btn visit-btn">
                            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                            </svg>
                            사이트 방문하기
                        </button>
                    </div>
                `;
            } else {
                modalClass = 'modal-danger';
                resultClass = 'result-danger';
                icon = '⚠️';
                title = '위험 감지!';

                // 위험 유형에 따른 설명
                const threatType = safetyResult.threat;
                description = threatType
                    ? `이 URL에서 ${threatType} 위험이 감지되었습니다`
                    : '이 URL은 안전하지 않은 것으로 확인되었습니다';

                tips = [
                    '⛔ 이 URL은 위험한 것으로 확인되었습니다',
                    '❌ 절대 접속하지 마세요',
                    '🚫 개인정보나 금융정보를 입력하지 마세요',
                    '📢 다른 사람에게도 위험성을 알려주세요'
                ];
                actionButtons = `
                    <button onclick="closeModal()" class="action-btn close-btn">
                        창 닫기
                    </button>
                `;
            }

            modalContent.innerHTML = `
                <div class="${modalClass}">
                    <div class="modal-icon">${icon}</div>
                    <h2 class="modal-title">${title}</h2>
                    <p class="modal-description">${description}</p>
                    <div class="modal-url ${resultClass}">
            <span class="url-text" title="${decodedText}">${decodedText}</span>
            <button onclick="copyToClipboard('${decodedText}')" class="copy-btn">
                <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                </svg>
                <span class="btn-text">복사</span>
            </button>
        </div>
                    <div class="modal-tips">
                        <h4>💡 안전 알림</h4>
                        <ul>
                            ${tips.map(tip => `<li>${tip}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="modal-actions">
                        ${actionButtons}
                    </div>
                    <div class="modal-details">
                        <button onclick="toggleDetails()" class="details-toggle">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            상세 검사 결과 보기
        </button>
                        <div class="details-content" style="display: none;">
                            <pre>${JSON.stringify(safetyResult.originalResponse, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            `;

            this.scanning = true;
        } catch (error) {
            modalContent.innerHTML = `
                <div class="modal-warning">
                    <div class="modal-icon">⚠️</div>
                    <h2 class="modal-title">검사 실패</h2>
                    <p class="modal-description">URL 안전성 검사 중 오류가 발생했습니다</p>
                    <div class="modal-url">${decodedText}</div>
                    <div class="modal-tips">
                        <h4>💡 권장 조치사항</h4>
                        <ul>
                            <li>네트워크 연결 상태를 확인해주세요</li>
                            <li>잠시 후 다시 시도해주세요</li>
                            <li>문제가 계속되면 관리자에게 문의하세요</li>
                        </ul>
                    </div>
                    <div class="modal-actions">
                        <button onclick="retryScanning()" class="action-btn retry-btn">
                            다시 검사하기
                        </button>
                    </div>
                </div>
            `;

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
    if (modal) {
        modal.classList.remove('show');
    }
    // 모달을 닫아도 스캐너는 계속 작동하도록 설정
    if (qrScanner) {
        qrScanner.scanning = true;
    }
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

        // 복사 버튼에 성공 애니메이션 추가
        const copyBtn = document.querySelector('.copy-btn');
        copyBtn.classList.add('copy-success');

        // 토스트 메시지 표시
        const toast = document.createElement('div');
        toast.className = 'copy-toast';
        toast.textContent = 'URL이 클립보드에 복사되었습니다';
        document.body.appendChild(toast);

        // 애니메이션 타이밍
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);

        // 버튼 애니메이션 초기화
        setTimeout(() => copyBtn.classList.remove('copy-success'), 300);

    } catch (err) {
        console.error('클립보드 복사 실패:', err);
        alert('클립보드 복사에 실패했습니다.');
    }
}


function retryScanning() {
    try {
        closeModal();
        if (qrScanner) {
            qrScanner.restart().catch(error => {
                console.error('재시도 중 오류 발생:', error);
                handleScanError(error);
            });
        } else {
            console.error('QR 스캐너가 초기화되지 않았습니다.');
            handleScanError(new Error('스캐너 초기화 필요'));
        }
    } catch (error) {
        console.error('재시도 처리 중 오류:', error);
        handleScanError(error);
    }
}

function handleScanError(error) {
    const errorElement = document.getElementById('qr-reader');
    if (errorElement) {
        errorElement.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--error);">
                <p>스캐너 재시작 중 오류가 발생했습니다.</p>
                <p>${error.message}</p>
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
}


function retryCamera() {
    if (qrScanner) {
        qrScanner.cleanup();
        qrScanner.init().catch(error => {
            console.error('카메라 재시작 실패:', error);
            handleScanError(error);
        });
    }
}

// 이벤트 리스너들
document.addEventListener('DOMContentLoaded', () => {
    function initializeScanner() {
        if (typeof jsQR === 'undefined') {
            setTimeout(initializeScanner, 1000);
            return;
        }

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