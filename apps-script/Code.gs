const TODO = Object.freeze({
  spreadsheetId: '12H0T5YE8K-YHeQ57dV80MJqLrH58YgZWGxiQEiK6AAU',
  taskSheet: 'Tarefas',
  contactSheet: 'Interlocutores',
  headerRow: 4,
  taskColumns: 19,
  contactColumns: 8,
  timeZone: 'America/Sao_Paulo',
  sessionSeconds: 21600,
  defaultEventMinutes: 60
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ToDo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function login(password) {
  const expected = getRequiredProperty_('APP_PASSWORD');
  if (!constantTimeEquals_(String(password || ''), expected)) {
    Utilities.sleep(350);
    throw new Error('Senha incorreta.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(sessionKey_(token), '1', TODO.sessionSeconds);
  return { token: token, expiresIn: TODO.sessionSeconds };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove(sessionKey_(token));
  return true;
}

function listTasks(token) {
  requireSession_(token);
  const spreadsheet = getSpreadsheet_();
  const tasks = readTasks_(spreadsheet);
  const contactsByTask = readContacts_(spreadsheet);

  return tasks
    .map(function(task) {
      task.contacts = contactsByTask[task.id] || legacyContact_(task.legacyContact);
      delete task.legacyContact;
      return task;
    })
    .sort(function(a, b) { return a.order - b.order; });
}

function saveTask(token, input) {
  requireSession_(token);
  const task = normalizeTask_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(TODO.taskSheet);
    const existing = findTaskRow_(sheet, task.id);
    const now = new Date();
    const createdAt = existing ? sheet.getRange(existing, 12).getValue() || now : now;
    const existingEventId = existing ? String(sheet.getRange(existing, 18).getValue() || '') : '';
    let calendarResult = { eventId: existingEventId, syncedAt: '', warning: '' };

    try {
      calendarResult = syncCalendarEvent_(task, existingEventId);
    } catch (error) {
      calendarResult.warning = 'A tarefa foi salva, mas a Agenda não foi sincronizada: ' + error.message;
    }

    const row = existing || Math.max(sheet.getLastRow() + 1, TODO.headerRow + 1);
    const completedAt = task.status === 'Concluído'
      ? (task.completedAt ? new Date(task.completedAt) : now)
      : '';

    sheet.getRange(row, 1, 1, TODO.taskColumns).setValues([[
      task.id,
      slugify_(task.title),
      task.title,
      task.nextAction,
      task.status,
      task.priority,
      parseDate_(task.deadline, 'date'),
      parseDate_(task.schedule, 'datetime'),
      task.tags.join(', '),
      task.dependency,
      task.contacts.map(function(contact) { return contact.name; }).filter(Boolean).join(', '),
      createdAt,
      now,
      completedAt,
      task.link,
      task.color,
      task.order,
      calendarResult.eventId || '',
      calendarResult.syncedAt || ''
    ]]);

    replaceContacts_(spreadsheet, task.id, task.contacts, now);
    const saved = listTasks(token).filter(function(item) { return item.id === task.id; })[0];
    return { task: saved, calendarWarning: calendarResult.warning || '' };
  } finally {
    lock.releaseLock();
  }
}

function deleteTask(token, taskId) {
  requireSession_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(TODO.taskSheet);
    const row = findTaskRow_(sheet, taskId);
    if (!row) return true;

    const eventId = String(sheet.getRange(row, 18).getValue() || '');
    if (eventId) {
      try {
        const event = getCalendar_().getEventById(eventId);
        if (event) event.deleteEvent();
      } catch (error) {
        console.warn('Não foi possível remover o evento: ' + error.message);
      }
    }

    sheet.deleteRow(row);
    replaceContacts_(spreadsheet, taskId, [], new Date());
    return true;
  } finally {
    lock.releaseLock();
  }
}

function reorderTasks(token, orderedIds) {
  requireSession_(token);
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  if (!ids.length) return true;

  const sheet = getSpreadsheet_().getSheetByName(TODO.taskSheet);
  const lastRow = sheet.getLastRow();
  if (lastRow <= TODO.headerRow) return true;

  const idValues = sheet.getRange(TODO.headerRow + 1, 1, lastRow - TODO.headerRow, 1).getValues();
  const orderById = {};
  ids.forEach(function(id, index) { orderById[id] = index; });
  const orderValues = idValues.map(function(row, index) {
    const id = String(row[0] || '');
    return [Object.prototype.hasOwnProperty.call(orderById, id) ? orderById[id] : ids.length + index];
  });
  sheet.getRange(TODO.headerRow + 1, 17, orderValues.length, 1).setValues(orderValues);
  return true;
}

function createTaskFromPrompt(token, prompt) {
  requireSession_(token);
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Descreva a tarefa antes de usar a IA.');
  if (cleanPrompt.length > 3000) throw new Error('A descrição está longa demais.');

  const properties = PropertiesService.getScriptProperties();
  const apiKey = getRequiredProperty_('OPENAI_API_KEY');
  const model = getRequiredProperty_('OPENAI_MODEL');
  const now = Utilities.formatDate(new Date(), TODO.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      nextAction: { type: 'string' },
      status: { type: 'string', enum: ['Fazer', 'Em andamento', 'Aguardando', 'Stand-by'] },
      priority: { type: 'string', enum: ['Alta', 'Média', 'Baixa'] },
      schedule: { type: 'string', description: "Data e hora em yyyy-MM-dd'T'HH:mm ou string vazia." },
      deadline: { type: 'string', description: 'Data em yyyy-MM-dd ou string vazia.' },
      link: { type: 'string' },
      dependency: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      color: { type: 'string', enum: ['neutral', 'blue', 'sand', 'green', 'lavender'] },
      contacts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            whatsapp: { type: 'string' }
          },
          required: ['name', 'email', 'phone', 'whatsapp']
        }
      }
    },
    required: ['title', 'nextAction', 'status', 'priority', 'schedule', 'deadline', 'link', 'dependency', 'tags', 'color', 'contacts']
  };

  const payload = {
    model: model,
    input: [
      {
        role: 'system',
        content: 'Converta a descrição em uma tarefa pessoal objetiva. Não invente contatos, links ou datas. Resolva expressões temporais em relação ao horário informado. Use português do Brasil.'
      },
      {
        role: 'user',
        content: 'Horário atual: ' + now + '\nDescrição: ' + cleanPrompt
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'todo_task',
        strict: true,
        schema: schema
      }
    }
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const data = JSON.parse(response.getContentText() || '{}');
  if (status < 200 || status >= 300) {
    const message = data.error && data.error.message ? data.error.message : 'Erro ' + status;
    throw new Error('A OpenAI não conseguiu interpretar a tarefa: ' + message);
  }

  const output = extractOutputText_(data);
  if (!output) throw new Error('A OpenAI não retornou uma tarefa utilizável.');
  return normalizeTask_(JSON.parse(output), true);
}

function readTasks_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(TODO.taskSheet);
  const lastRow = sheet.getLastRow();
  if (lastRow <= TODO.headerRow) return [];
  const rows = sheet.getRange(TODO.headerRow + 1, 1, lastRow - TODO.headerRow, TODO.taskColumns).getValues();

  return rows.filter(function(row) { return row[0]; }).map(function(row, index) {
    return {
      id: String(row[0]),
      title: String(row[2] || ''),
      nextAction: String(row[3] || ''),
      status: String(row[4] || 'Fazer'),
      priority: String(row[5] || 'Média'),
      deadline: formatSheetDate_(row[6], 'yyyy-MM-dd'),
      schedule: formatSheetDate_(row[7], "yyyy-MM-dd'T'HH:mm"),
      tags: String(row[8] || '').split(',').map(function(tag) { return tag.trim(); }).filter(Boolean),
      dependency: String(row[9] || ''),
      legacyContact: String(row[10] || ''),
      createdAt: dateMillis_(row[11]),
      updatedAt: dateMillis_(row[12]),
      completedAt: dateMillis_(row[13]) || null,
      link: String(row[14] || ''),
      color: String(row[15] || 'neutral'),
      order: Number(row[16]) || index,
      calendarEventId: String(row[17] || ''),
      calendarSyncedAt: dateMillis_(row[18]) || null,
      contacts: []
    };
  });
}

function readContacts_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(TODO.contactSheet);
  const lastRow = sheet.getLastRow();
  const result = {};
  if (lastRow <= TODO.headerRow) return result;

  sheet.getRange(TODO.headerRow + 1, 1, lastRow - TODO.headerRow, TODO.contactColumns).getValues()
    .filter(function(row) { return row[0] && row[1]; })
    .forEach(function(row) {
      const taskId = String(row[1]);
      if (!result[taskId]) result[taskId] = [];
      result[taskId].push({
        id: String(row[0]),
        name: String(row[2] || ''),
        email: String(row[3] || ''),
        phone: String(row[4] || ''),
        whatsapp: String(row[5] || '')
      });
    });
  return result;
}

function replaceContacts_(spreadsheet, taskId, contacts, now) {
  const sheet = spreadsheet.getSheetByName(TODO.contactSheet);
  const lastRow = sheet.getLastRow();
  const existing = lastRow > TODO.headerRow
    ? sheet.getRange(TODO.headerRow + 1, 1, lastRow - TODO.headerRow, TODO.contactColumns).getValues()
    : [];
  const kept = existing.filter(function(row) { return String(row[1] || '') !== String(taskId); });
  const added = contacts.map(function(contact) {
    return [
      contact.id || Utilities.getUuid(),
      taskId,
      contact.name,
      contact.email,
      contact.phone,
      contact.whatsapp,
      now,
      now
    ];
  });
  const rows = kept.concat(added);
  if (lastRow > TODO.headerRow) {
    sheet.getRange(TODO.headerRow + 1, 1, lastRow - TODO.headerRow, TODO.contactColumns).clearContent();
  }
  if (rows.length) sheet.getRange(TODO.headerRow + 1, 1, rows.length, TODO.contactColumns).setValues(rows);
}

function syncCalendarEvent_(task, existingEventId) {
  const calendar = getCalendar_();
  let event = existingEventId ? calendar.getEventById(existingEventId) : null;
  if (!task.schedule) {
    if (event) event.deleteEvent();
    return { eventId: '', syncedAt: '', warning: '' };
  }

  const start = parseDate_(task.schedule, 'datetime');
  const minutes = Number(PropertiesService.getScriptProperties().getProperty('DEFAULT_EVENT_MINUTES')) || TODO.defaultEventMinutes;
  const end = new Date(start.getTime() + minutes * 60000);
  const description = [
    task.nextAction,
    task.dependency ? 'Pendência: ' + task.dependency : '',
    task.link
  ].filter(Boolean).join('\n\n');

  if (event) {
    event.setTitle(task.title).setTime(start, end).setDescription(description);
  } else {
    event = calendar.createEvent(task.title, start, end, { description: description });
  }
  return { eventId: event.getId(), syncedAt: new Date(), warning: '' };
}

function getCalendar_() {
  const calendarId = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  if (!calendarId || calendarId === 'primary') return CalendarApp.getDefaultCalendar();
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw new Error('Calendário não encontrado.');
  return calendar;
}

function normalizeTask_(input, fromAi) {
  const source = input && typeof input === 'object' ? input : {};
  const task = {
    id: fromAi ? '' : String(source.id || Utilities.getUuid()),
    title: cleanString_(source.title, 240),
    nextAction: cleanString_(source.nextAction, 1000),
    status: allowed_(source.status, ['Fazer', 'Em andamento', 'Aguardando', 'Stand-by', 'Concluído'], 'Fazer'),
    priority: allowed_(source.priority, ['Alta', 'Média', 'Baixa'], 'Média'),
    deadline: cleanString_(source.deadline, 10),
    schedule: cleanString_(source.schedule, 16),
    link: cleanString_(source.link, 2000),
    dependency: cleanString_(source.dependency, 1000),
    tags: Array.isArray(source.tags) ? source.tags.map(function(tag) { return cleanString_(tag, 80); }).filter(Boolean).slice(0, 20) : [],
    color: allowed_(source.color, ['neutral', 'blue', 'sand', 'green', 'lavender'], 'neutral'),
    contacts: normalizeContacts_(source.contacts),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 999999,
    completedAt: source.completedAt ? Number(source.completedAt) : null
  };
  if (!task.title) throw new Error('A tarefa precisa de um título.');
  if (task.link && !/^https?:\/\//i.test(task.link)) throw new Error('O link precisa começar com http:// ou https://.');
  return task;
}

function normalizeContacts_(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts.slice(0, 20).map(function(contact) {
    return {
      id: cleanString_(contact && contact.id, 80),
      name: cleanString_(contact && contact.name, 160),
      email: cleanString_(contact && contact.email, 240),
      phone: cleanString_(contact && contact.phone, 80),
      whatsapp: cleanString_(contact && contact.whatsapp, 80)
    };
  }).filter(function(contact) {
    return contact.name || contact.email || contact.phone || contact.whatsapp;
  });
}

function findTaskRow_(sheet, taskId) {
  if (!taskId || sheet.getLastRow() <= TODO.headerRow) return 0;
  const match = sheet.getRange(TODO.headerRow + 1, 1, sheet.getLastRow() - TODO.headerRow, 1)
    .createTextFinder(String(taskId)).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(TODO.spreadsheetId);
}

function parseDate_(value, type) {
  if (!value) return '';
  const pattern = type === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm";
  try {
    return Utilities.parseDate(String(value), TODO.timeZone, pattern);
  } catch (error) {
    throw new Error(type === 'date' ? 'Prazo inválido.' : 'Agendamento inválido.');
  }
}

function formatSheetDate_(value, pattern) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? '' : Utilities.formatDate(date, TODO.timeZone, pattern);
}

function dateMillis_(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function extractOutputText_(response) {
  const output = response && Array.isArray(response.output) ? response.output : [];
  for (let i = 0; i < output.length; i += 1) {
    const content = Array.isArray(output[i].content) ? output[i].content : [];
    for (let j = 0; j < content.length; j += 1) {
      if (content[j].type === 'output_text' && content[j].text) return content[j].text;
    }
  }
  return '';
}

function legacyContact_(value) {
  return value ? [{ id: '', name: value, email: '', phone: '', whatsapp: '' }] : [];
}

function cleanString_(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function allowed_(value, values, fallback) {
  return values.indexOf(String(value || '')) >= 0 ? String(value) : fallback;
}

function slugify_(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 120);
}

function sessionKey_(token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''));
  return 'session:' + Utilities.base64EncodeWebSafe(digest);
}

function requireSession_(token) {
  if (!token || !CacheService.getScriptCache().get(sessionKey_(token))) {
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  CacheService.getScriptCache().put(sessionKey_(token), '1', TODO.sessionSeconds);
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Configuração ausente no Apps Script: ' + name + '.');
  return value;
}

function constantTimeEquals_(a, b) {
  const left = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  const right = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left[i] ^ right[i];
  return result === 0;
}
