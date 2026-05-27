// Global State variables
let studentsList = [];
let supervisorsList = [];
let generatedGroupsData = [];
let studentHasGenderColumn = false;

// Toast helper
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastIconBg = document.getElementById('toast-icon-bg');
    const toastIcon = document.getElementById('toast-icon');
    const toastMsg = document.getElementById('toast-msg');

    if (!toast || !toastIconBg || !toastIcon || !toastMsg) return;

    if (type === 'success') {
        toastIconBg.className = 'inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600';
        toastIcon.className = 'fa-solid fa-circle-check';
    } else if (type === 'error') {
        toastIconBg.className = 'inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg bg-rose-100 text-rose-600';
        toastIcon.className = 'fa-solid fa-circle-xmark';
    } else {
        toastIconBg.className = 'inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 text-blue-600';
        toastIcon.className = 'fa-solid fa-circle-info';
    }

    toastMsg.innerText = message;
    toast.classList.remove('translate-y-[-100px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-[-100px]', 'opacity-0');
    }, 5000);
}

function checkAndAutoAdjustGroupSize() {
    const sizeInput = document.getElementById('groupSize');
    const autoCalcBadge = document.getElementById('auto-calc-badge');
    const autoCalcInfo = document.getElementById('auto-calc-info');

    if (!sizeInput || !autoCalcBadge || !autoCalcInfo) return;

    if (studentsList.length > 0 && supervisorsList.length > 0) {
        const ratio = studentsList.length / supervisorsList.length;
        const minSize = Math.max(1, Math.floor(ratio));
        const maxSize = Math.max(1, Math.ceil(ratio));
        const recommendedRange = minSize === maxSize ? `${maxSize}` : `${minSize}-${maxSize}`;

        sizeInput.value = recommendedRange;
        autoCalcBadge.classList.remove('hidden');
        autoCalcInfo.innerHTML = `<i class="fa-solid fa-circle-info text-brand-600"></i> Automatically set range to <strong>${recommendedRange}</strong> based on <strong>${studentsList.length}</strong> students and <strong>${supervisorsList.length}</strong> lecturers.`;
        autoCalcInfo.classList.remove('hidden');
    } else {
        autoCalcBadge.classList.add('hidden');
        autoCalcInfo.classList.add('hidden');
    }
}

function parseGroupSizeRange(rawValue) {
    const value = String(rawValue || '').trim();

    if (/^\d+$/.test(value)) {
        const single = parseInt(value, 10);
        if (single < 1) return null;
        return { min: single, max: single };
    }

    const rangeMatch = value.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!rangeMatch) return null;

    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);

    if (min < 1 || max < 1 || min > max) return null;
    return { min, max };
}

function buildGroupSizePlan(totalStudents, minSize, maxSize) {
    const minGroups = Math.ceil(totalStudents / maxSize);
    const maxGroups = Math.floor(totalStudents / minSize);

    if (minGroups > maxGroups) return null;

    for (let groupCount = minGroups; groupCount <= maxGroups; groupCount++) {
        const minTotal = groupCount * minSize;
        const maxTotal = groupCount * maxSize;

        if (totalStudents < minTotal || totalStudents > maxTotal) continue;

        const sizes = new Array(groupCount).fill(minSize);
        let remaining = totalStudents - minTotal;
        const increment = maxSize - minSize;

        if (increment === 0) {
            return remaining === 0 ? sizes : null;
        }

        for (let i = 0; i < groupCount && remaining > 0; i++) {
            const add = Math.min(increment, remaining);
            sizes[i] += add;
            remaining -= add;
        }

        if (remaining === 0) return sizes;
    }

    return null;
}

function updateStepNavigation(activeStep) {
    const steps = document.querySelectorAll('.step-item');
    steps.forEach((step, idx) => {
        const stepNum = idx + 1;
        if (stepNum < activeStep) {
            step.className = `step-item flex-1 py-3 text-center ${idx === 0 ? 'step-clip-path-first' : 'step-clip-path'} bg-emerald-500 text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2`;
        } else if (stepNum === activeStep) {
            step.className = `step-item flex-1 py-3 text-center ${idx === 0 ? 'step-clip-path-first' : 'step-clip-path'} bg-brand-900 text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2`;
        } else {
            step.className = `step-item flex-1 py-3 text-center ${idx === 3 ? 'step-clip-path-last' : 'step-clip-path'} bg-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2`;
        }
    });
}

function parseCSVRows(text) {
    return text.split(/\r?\n/).filter(line => line.trim() !== '').map(line => line.split(',').map(cell => cell.trim().replace(/^['"]|['"]$/g, '')));
}

function normalizeCellValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/^['"]|['"]$/g, '');
}

function getHeaderKeywordSet(type) {
    if (type === 'student') {
        return [
            'nama', 'nama mahasiswa', 'nama siswa', 'student name', 'name',
            'nim', 'id', 'no induk', 'nomor induk',
            'prodi', 'program studi', 'jurusan', 'study program', 'department',
            'gender', 'kelamin', 'jenis kelamin', 'jk', 'l/p', 'sex'
        ];
    }

    return [
        'nama', 'nama dosen', 'dosen', 'supervisor', 'pembimbing', 'nama pembimbing',
        'nip', 'nidn'
    ];
}

function isHeaderLikeRow(row, type) {
    const keywords = getHeaderKeywordSet(type);
    const values = row.map(cell => normalizeCellValue(cell).toLowerCase()).filter(Boolean);
    return values.some(value => keywords.includes(value));
}

function mapTableRows(rawRows, type) {
    if (!rawRows.length) return [];

    let headerRowIndex = -1;
    for (let i = 0; i < rawRows.length; i++) {
        if (isHeaderLikeRow(rawRows[i], type)) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    const headers = rawRows[headerRowIndex].map(cell => normalizeCellValue(cell));
    const mappedRows = [];

    for (const row of rawRows.slice(headerRowIndex + 1)) {
        const hasAnyValue = row.some(cell => normalizeCellValue(cell) !== '');
        if (!hasAnyValue) continue;

        const item = {};
        headers.forEach((header, index) => {
            const value = row[index];
            if (value === undefined || value === null || normalizeCellValue(value) === '') return;
            item[header] = value;
        });
        mappedRows.push(item);
    }

    return mappedRows;
}

function readTabularFile(file, type) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const extension = file.name.split('.').pop().toLowerCase();

        reader.onload = event => {
            try {
                const data = event.target.result;
                let rawRows = [];

                if (extension === 'csv') {
                    const text = new TextDecoder('utf-8').decode(data);
                    rawRows = parseCSVRows(text);
                } else {
                    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                }

                resolve(mapTableRows(rawRows, type));
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsArrayBuffer(file);
    });
}

function handleStudentUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    readTabularFile(file, 'student').then(rawList => {
        if (rawList.length === 0) {
            showToast('The file is empty or could not be read correctly.', 'error');
            return;
        }

        studentHasGenderColumn = false;
        studentsList = rawList.map(item => {
            const newItem = {};

            Object.keys(item).forEach(key => {
                const cleanKey = key.trim().toLowerCase();

                if (cleanKey === 'nama' || cleanKey === 'nama mahasiswa' || cleanKey === 'nama siswa' || cleanKey === 'student name' || cleanKey === 'name') {
                    newItem.Nama = item[key];
                } else if (cleanKey === 'nim' || cleanKey === 'id' || cleanKey === 'no induk' || cleanKey === 'nomor induk') {
                    newItem.NIM = item[key];
                } else if (cleanKey === 'prodi' || cleanKey === 'program studi' || cleanKey === 'jurusan' || cleanKey === 'study program' || cleanKey === 'department') {
                    newItem.Prodi = item[key];
                } else if (cleanKey === 'gender' || cleanKey === 'kelamin' || cleanKey === 'jenis kelamin' || cleanKey === 'l/p' || cleanKey === 'sex') {
                    newItem.Gender = item[key];
                    if (normalizeCellValue(item[key]) !== '') studentHasGenderColumn = true;
                } else {
                    newItem[key] = item[key];
                }
            });

            if (!newItem.Nama) newItem.Nama = 'Unnamed Student';
            if (!newItem.NIM) newItem.NIM = '-';
            if (!newItem.Prodi) newItem.Prodi = 'ILMU KOMUNIKASI';
            if (!newItem.Gender) newItem.Gender = '';
            return newItem;
        });

        const studentStatus = document.getElementById('student-status');
        const studentCount = document.getElementById('student-count');
        if (studentStatus && studentCount) {
            studentStatus.classList.remove('hidden');
            studentCount.innerText = studentsList.length;
        }

        showToast(`Successfully loaded ${studentsList.length} student records!`, 'success');
        updateStepNavigation(2);
        checkAndAutoAdjustGroupSize();
    }).catch(error => {
        console.error(error);
        showToast('An error occurred while reading the student file.', 'error');
    });
}

function handleSupervisorUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    readTabularFile(file, 'supervisor').then(rawList => {
        if (rawList.length === 0) {
            showToast('The lecturer file is empty or could not be read correctly.', 'error');
            return;
        }

        supervisorsList = rawList.map(item => {
            const newItem = {};
            Object.keys(item).forEach(key => {
                const cleanKey = key.trim().toLowerCase();
                if (cleanKey === 'nama' || cleanKey === 'nama dosen' || cleanKey === 'dosen' || cleanKey === 'supervisor' || cleanKey === 'pembimbing' || cleanKey === 'nama pembimbing') {
                    newItem.Nama = item[key];
                } else if (cleanKey === 'nip' || cleanKey === 'nidn') {
                    newItem.NIP = item[key];
                } else {
                    newItem[key] = item[key];
                }
            });
            if (!newItem.Nama) newItem.Nama = 'Unnamed Lecturer';
            return newItem;
        });

        const supervisorStatus = document.getElementById('supervisor-status');
        const supervisorCount = document.getElementById('supervisor-count');
        if (supervisorStatus && supervisorCount) {
            supervisorStatus.classList.remove('hidden');
            supervisorCount.innerText = supervisorsList.length;
        }

        showToast(`Successfully loaded ${supervisorsList.length} lecturer records!`, 'success');
        checkAndAutoAdjustGroupSize();
    }).catch(error => {
        console.error(error);
        showToast('An error occurred while reading the lecturer file.', 'error');
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateGroups() {
    if (studentsList.length === 0) {
        showToast('Please upload the student data file first!', 'error');
        return;
    }

    const sizeInput = document.getElementById('groupSize');
    const parsedRange = parseGroupSizeRange(sizeInput ? sizeInput.value : '');
    if (!parsedRange) {
        showToast('Group size must be a number (6) or range (6-7).', 'error');
        return;
    }

    const mode = document.getElementById('groupMode').value;
    let tempStudents = [...studentsList];

    if (mode === 'gender_balanced') {
        if (!studentHasGenderColumn) {
            showToast('Processing failed! Gender Balanced mode requires gender values in the student file.', 'error');
            return;
        }

        const males = tempStudents.filter(student => {
            const gender = String(student.Gender || '').toUpperCase().trim();
            return gender === 'L' || gender === 'LAKI-LAKI' || gender === 'LAKI LAKI' || gender === 'M' || gender === 'MALE';
        });
        const females = tempStudents.filter(student => {
            const gender = String(student.Gender || '').toUpperCase().trim();
            return gender === 'P' || gender === 'PEREMPUAN' || gender === 'F' || gender === 'FEMALE';
        });

        tempStudents = [];
        const maxLen = Math.max(males.length, females.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < males.length) tempStudents.push(males[i]);
            if (i < females.length) tempStudents.push(females[i]);
        }
    } else if (mode === 'random') {
        tempStudents = shuffleArray(tempStudents);
    } else {
        tempStudents.sort((a, b) => String(a.Nama).localeCompare(String(b.Nama)));
    }

    const groupSizes = buildGroupSizePlan(tempStudents.length, parsedRange.min, parsedRange.max);
    if (!groupSizes || groupSizes.length === 0) {
        showToast('Unable to build groups using that range. Please adjust the size range.', 'error');
        return;
    }

    generatedGroupsData = [];
    let cursor = 0;

    for (let idx = 0; idx < groupSizes.length; idx++) {
        const sizeForGroup = groupSizes[idx];
        const members = tempStudents.slice(cursor, cursor + sizeForGroup);
        cursor += sizeForGroup;
        let assignedSupervisor = 'No Supervisor Assigned';

        // One supervisor can only be assigned to one group.
        if (idx < supervisorsList.length) {
            assignedSupervisor = supervisorsList[idx].Nama;
        }

        generatedGroupsData.push({
            id: idx + 1,
            name: `Group ${idx + 1}`,
            members,
            supervisor: assignedSupervisor
        });
    }

    renderResults();
    showToast(`Successfully generated ${generatedGroupsData.length} groups!`, 'success');
    updateStepNavigation(3);
}

function renderResults() {
    const detailedResultsSection = document.getElementById('detailed-results');
    const resultsTableContainer = document.getElementById('results-table-container');
    const btnExport = document.getElementById('btnExport');

    if (!detailedResultsSection || !resultsTableContainer || !btnExport) return;

    detailedResultsSection.classList.remove('hidden');
    btnExport.disabled = false;
    btnExport.className = 'flex-1 bg-brand-900 hover:bg-brand-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 transform active:scale-95 cursor-pointer';

    resultsTableContainer.innerHTML = '';

    generatedGroupsData.forEach(group => {
        const groupBlock = document.createElement('div');
        groupBlock.className = 'bg-slate-50/50 p-4 sm:p-6 rounded-2xl border border-slate-100 group-block-element';
        groupBlock.innerHTML = `
            <div class="bg-brand-900/5 border-l-4 border-brand-900 px-4 py-3 rounded-r-xl mb-4 text-sm font-semibold text-brand-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>Supervisor: <span class="text-brand-900 font-bold font-heading ml-1 block sm:inline">${group.supervisor}</span></span>
                <span class="text-xs bg-brand-900 text-white px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">GROUP ${group.id}</span>
            </div>
            <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 border-b border-slate-200">
                            <th class="p-3 text-xs font-bold text-slate-700 uppercase tracking-wider w-16 text-center">No</th>
                            <th class="p-3 text-xs font-bold text-slate-700 uppercase tracking-wider w-36">NIM</th>
                            <th class="p-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Name</th>
                            <th class="p-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Program</th>
                            <th class="p-3 text-xs font-bold text-slate-700 uppercase tracking-wider w-28 text-center">Group</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-sm">
                        ${group.members.map((member, index) => `
                            <tr class="hover:bg-slate-50/50 transition-colors">
                                <td class="p-3 text-center text-xs font-medium text-slate-400 font-mono">${index + 1}</td>
                                <td class="p-3 text-slate-600 font-mono text-xs">${member.NIM}</td>
                                <td class="p-3 font-semibold text-slate-800 uppercase">${member.Nama}</td>
                                <td class="p-3 text-slate-500 uppercase text-xs">${member.Prodi || 'ILMU KOMUNIKASI'}</td>
                                <td class="p-3 text-center font-bold text-brand-900">${group.id}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        resultsTableContainer.appendChild(groupBlock);
    });
}

function filterResultsTable() {
    const input = document.getElementById('resultSearch');
    const filter = input ? input.value.toUpperCase() : '';
    const blocks = document.querySelectorAll('.group-block-element');

    blocks.forEach(block => {
        const text = block.textContent || block.innerText;
        block.style.display = text.toUpperCase().indexOf(filter) > -1 ? '' : 'none';
    });
}

function exportToExcel() {
    if (generatedGroupsData.length === 0) {
        showToast('There are no grouping results to export!', 'error');
        return;
    }

    const aoaData = [];
    const merges = [];
    let currentRowIdx = 0;

    generatedGroupsData.forEach(group => {
        aoaData.push([`Supervisor: ${group.supervisor}`]);
        merges.push({ s: { r: currentRowIdx, c: 0 }, e: { r: currentRowIdx, c: 4 } });
        currentRowIdx++;

        aoaData.push(['No', 'NIM', 'Name', 'Program', 'Group']);
        currentRowIdx++;

        group.members.forEach((member, index) => {
            aoaData.push([index + 1, member.NIM, member.Nama, member.Prodi || 'ILMU KOMUNIKASI', group.id]);
            currentRowIdx++;
        });

        aoaData.push([]);
        currentRowIdx++;
    });

    const worksheet = XLSX.utils.aoa_to_sheet(aoaData);
    worksheet['!merges'] = merges;
    worksheet['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 40 },
        { wch: 25 },
        { wch: 12 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Group Results');
    XLSX.writeFile(workbook, 'Group_Allocation_Report.xlsx');
    showToast('Excel report downloaded successfully!', 'success');
    updateStepNavigation(4);
}

function initLandingFlow() {
    const startButton = document.getElementById('startSessionBtn');
    const landingScreen = document.getElementById('landing-screen');
    const appShell = document.getElementById('app-shell');

    if (!startButton || !landingScreen || !appShell) return;

    startButton.addEventListener('click', () => {
        landingScreen.classList.add('hidden');
        appShell.classList.remove('hidden');
        updateStepNavigation(1);
        appShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// Landing flow removed: landing page is now a separate file (landing.html).
// If you need a SPA-style in-page landing, re-enable a similar init that
// toggles #landing-screen and #app-shell.
