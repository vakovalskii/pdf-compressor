// Настройка PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Элементы DOM
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('pdf-file');
const uploadSection = document.getElementById('upload-section');
const editorSection = document.getElementById('editor-section');
const pagesGrid = document.getElementById('pages-grid');
const progressSection = document.getElementById('progress-section');
const progressText = document.getElementById('progress-text');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');

const totalPagesEl = document.getElementById('total-pages');
const deletedPagesEl = document.getElementById('deleted-pages');
const remainingPagesEl = document.getElementById('remaining-pages');

const selectAllBtn = document.getElementById('select-all-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const restoreAllBtn = document.getElementById('restore-all-btn');
const savePdfBtn = document.getElementById('save-pdf-btn');
const errorResetBtn = document.getElementById('error-reset-btn');

let pdfDoc = null;
let pdfBytes = null;
let pages = [];
let draggedElement = null;

// Обработка клика на зону загрузки
dropZone.addEventListener('click', () => fileInput.click());

// Обработка выбора файла
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
});

// Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        handleFileSelect(file);
    }
});

// Обработка файла
async function handleFileSelect(file) {
    if (file.type !== 'application/pdf') {
        showError('Пожалуйста, выберите PDF файл');
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        showError('Размер файла не должен превышать 50 MB');
        return;
    }

    try {
        showProgress('Загрузка PDF...');
        
        // Читаем файл
        const arrayBuffer = await file.arrayBuffer();
        pdfBytes = new Uint8Array(arrayBuffer);
        
        showProgress('Загрузка документа...');
        
        // Загружаем с помощью pdf-lib
        pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        
        showProgress('Рендеринг страниц...');
        
        // Рендерим превью с помощью PDF.js
        await renderPages(arrayBuffer);
        
        hideProgress();
        uploadSection.style.display = 'none';
        editorSection.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading PDF:', error);
        showError('Не удалось загрузить PDF: ' + error.message);
    }
}

// Рендеринг страниц
async function renderPages(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    
    pages = [];
    pagesGrid.innerHTML = '';
    
    for (let i = 1; i <= numPages; i++) {
        showProgress(`Рендеринг страницы ${i} из ${numPages}...`);
        
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({scale: 0.5});
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        const pageData = {
            index: i - 1,
            originalIndex: i - 1,
            deleted: false,
            canvas: canvas
        };
        
        pages.push(pageData);
        createPageCard(pageData);
    }
    
    updateStats();
}

// Создание карточки страницы
function createPageCard(pageData) {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.draggable = true;
    card.dataset.index = pageData.index;
    
    const preview = pageData.canvas;
    preview.className = 'page-preview';
    
    const pageNumber = document.createElement('div');
    pageNumber.className = 'page-number';
    pageNumber.textContent = `Страница ${pageData.originalIndex + 1}`;
    
    const actions = document.createElement('div');
    actions.className = 'page-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'page-btn delete-btn';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.onclick = () => togglePageDelete(pageData.index);
    
    actions.appendChild(deleteBtn);
    
    card.appendChild(preview);
    card.appendChild(pageNumber);
    card.appendChild(actions);
    
    // Drag and drop для перестановки
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
    
    pagesGrid.appendChild(card);
}

// Обработка удаления страницы
function togglePageDelete(index) {
    const page = pages.find(p => p.index === index);
    if (!page) return;
    
    page.deleted = !page.deleted;
    
    const card = pagesGrid.querySelector(`[data-index="${index}"]`);
    if (page.deleted) {
        card.classList.add('selected');
        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn.textContent = 'Восстановить';
        deleteBtn.className = 'page-btn restore-btn';
    } else {
        card.classList.remove('selected');
        const restoreBtn = card.querySelector('.restore-btn');
        restoreBtn.textContent = 'Удалить';
        restoreBtn.className = 'page-btn delete-btn';
    }
    
    updateStats();
}

// Drag and Drop handlers
function handleDragStart(e) {
    draggedElement = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedElement !== e.target && e.target.classList.contains('page-card')) {
        const draggedIndex = parseInt(draggedElement.dataset.index);
        const targetIndex = parseInt(e.target.dataset.index);
        
        // Меняем местами в массиве
        const draggedPage = pages.find(p => p.index === draggedIndex);
        const targetPage = pages.find(p => p.index === targetIndex);
        
        draggedPage.index = targetIndex;
        targetPage.index = draggedIndex;
        
        // Обновляем DOM
        if (draggedElement.nextSibling === e.target) {
            pagesGrid.insertBefore(e.target, draggedElement);
        } else {
            pagesGrid.insertBefore(draggedElement, e.target);
        }
        
        // Обновляем data-index
        draggedElement.dataset.index = targetIndex;
        e.target.dataset.index = draggedIndex;
    }
    
    return false;
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// Обновление статистики
function updateStats() {
    const total = pages.length;
    const deleted = pages.filter(p => p.deleted).length;
    const remaining = total - deleted;
    
    totalPagesEl.textContent = total;
    deletedPagesEl.textContent = deleted;
    remainingPagesEl.textContent = remaining;
}

// Кнопки управления
selectAllBtn.addEventListener('click', () => {
    pages.forEach(page => {
        if (!page.deleted) {
            togglePageDelete(page.index);
        }
    });
});

deleteSelectedBtn.addEventListener('click', () => {
    const cards = pagesGrid.querySelectorAll('.page-card:not(.selected)');
    cards.forEach(card => {
        const index = parseInt(card.dataset.index);
        const page = pages.find(p => p.index === index);
        if (page && !page.deleted) {
            togglePageDelete(index);
        }
    });
});

restoreAllBtn.addEventListener('click', () => {
    pages.forEach(page => {
        if (page.deleted) {
            togglePageDelete(page.index);
        }
    });
});

// Сохранение PDF
savePdfBtn.addEventListener('click', async () => {
    try {
        const remaining = pages.filter(p => !p.deleted).length;
        
        if (remaining === 0) {
            showError('Нельзя сохранить пустой PDF. Восстановите хотя бы одну страницу.');
            return;
        }
        
        showProgress('Создание нового PDF...');
        
        // Создаём новый PDF
        const newPdf = await PDFLib.PDFDocument.create();
        
        // Загружаем оригинальный PDF
        const originalPdf = await PDFLib.PDFDocument.load(pdfBytes);
        
        // Сортируем страницы по текущему порядку
        const sortedPages = [...pages].sort((a, b) => a.index - b.index);
        
        // Копируем только не удалённые страницы в правильном порядке
        let copiedCount = 0;
        for (const page of sortedPages) {
            if (!page.deleted) {
                showProgress(`Копирование страницы ${copiedCount + 1} из ${remaining}...`);
                const [copiedPage] = await newPdf.copyPages(originalPdf, [page.originalIndex]);
                newPdf.addPage(copiedPage);
                copiedCount++;
            }
        }
        
        showProgress('Сохранение PDF...');
        
        // Сохраняем
        const newPdfBytes = await newPdf.save();
        
        // Скачиваем
        const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        hideProgress();
        
        alert(`✅ PDF сохранён!\n\nСтраниц: ${remaining} из ${pages.length}`);
        
    } catch (error) {
        console.error('Error saving PDF:', error);
        showError('Ошибка при сохранении PDF: ' + error.message);
    }
});

// Вспомогательные функции
function showProgress(text) {
    progressText.textContent = text;
    progressSection.style.display = 'block';
    errorSection.style.display = 'none';
}

function hideProgress() {
    progressSection.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    progressSection.style.display = 'none';
}

function resetEditor() {
    uploadSection.style.display = 'block';
    editorSection.style.display = 'none';
    errorSection.style.display = 'none';
    progressSection.style.display = 'none';
    pagesGrid.innerHTML = '';
    pages = [];
    pdfDoc = null;
    pdfBytes = null;
    fileInput.value = '';
}

errorResetBtn.addEventListener('click', resetEditor);

console.log('📄 PDF Editor загружен!');

