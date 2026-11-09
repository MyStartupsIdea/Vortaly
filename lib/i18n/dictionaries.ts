import type { Locale } from "@/lib/types";

const ru = {
  "nav.book": "Записаться",
  "nav.bookings": "Мои записи",
  "nav.salon": "Салон",

  "salon.openToday": "Сегодня до {time}",
  "salon.reviews": "{count} отзывов",
  "salon.call": "Позвонить",
  "salon.route": "Как добраться",

  "home.servicesTitle": "Что сделать",
  "home.servicesHint": "Можно выбрать несколько — мы сложим время и цену",
  "home.popular": "Чаще всего берут",
  "home.mastersTitle": "Мастера",
  "home.mastersHint": "Запись к конкретному мастеру или к первому свободному",

  "group.hair": "Волосы",
  "group.beard": "Борода",
  "group.color": "Окрашивание",
  "group.nails": "Ногти",
  "group.brows": "Брови и ресницы",

  "step.services": "Услуги",
  "step.master": "Мастер",
  "step.time": "Время",
  "step.confirm": "Подтверждение",
  "step.of": "Шаг {current} из {total}",

  "master.anyTitle": "Первый свободный",
  "master.anyHint": "Подберём мастера под выбранное время",
  "master.worksToday": "Работает сегодня",
  "master.dayOff": "Сегодня выходной",
  "master.cannotDoAll": "Не делает все выбранные услуги",

  "time.pickDay": "Выберите день",
  "time.pickSlot": "Свободное время",
  "time.noSlots": "На этот день всё занято. Попробуйте другой.",
  "time.morning": "Утро",
  "time.day": "День",
  "time.evening": "Вечер",
  "time.taken": "занято",
  "time.today": "Сегодня",
  "time.tomorrow": "Завтра",

  "confirm.title": "Проверьте запись",
  "confirm.when": "Когда",
  "confirm.who": "Мастер",
  "confirm.what": "Услуги",
  "confirm.duration": "Займёт",
  "confirm.total": "К оплате",
  "confirm.name": "Ваше имя",
  "confirm.namePlaceholder": "Как к вам обращаться",
  "confirm.phone": "Телефон",
  "confirm.payLater": "Оплатить в салоне",
  "confirm.payNow": "Оплатить онлайн",
  "confirm.submit": "Записаться",
  "confirm.sending": "Записываем…",

  "booking.created": "Вы записаны",
  "booking.createdHint": "Напомним в Telegram за два часа до визита",
  "booking.toBookings": "Открыть мои записи",
  "booking.cancel": "Отменить запись",
  "booking.empty": "Записей пока нет",
  "booking.emptyHint": "Выберите услугу — это займёт меньше минуты",
  "booking.emptyCta": "Выбрать услугу",

  "status.pending": "Ждёт подтверждения",
  "status.confirmed": "Подтверждена",
  "status.paid": "Оплачена",
  "status.cancelled": "Отменена",
  "status.draft": "Черновик",
  "status.all": "Все",

  "pay.title": "Оплата",
  "pay.hint": "Спишем только стоимость услуг, без комиссии",
  "pay.click": "Click",
  "pay.payme": "Payme",
  "pay.cash": "Наличными в салоне",
  "pay.submit": "Перейти к оплате",
  "pay.stub": "Платёжный шлюз ещё не подключён. Кнопка пока показывает, какой запрос уйдёт в {provider}.",
  "pay.back": "Вернуться к записи",

  "error.pickService": "Выберите хотя бы одну услугу",
  "error.pickMaster": "Выберите мастера",
  "error.pickTime": "Выберите день и время",
  "error.name": "Введите имя",
  "error.phone": "Введите номер в формате +998 90 123 45 67",
  "error.generic": "Не получилось сохранить запись. Попробуйте ещё раз.",
  "error.genericHint": "Всё, что вы ввели, сохранено — можно отправить ещё раз.",
  /* Refusals from the booking API: each one names the cause and says what
     happened to the entered data. */
  "error.slotTaken": "Это время только что заняли",
  "error.slotTakenHint":
    "Услуги, мастер, дата и ваши контакты сохранены. Выберите другое время — заполнять заново не нужно.",
  "error.rejected": "Салон не принял эти данные",
  "error.rejectedHint":
    "Всё введённое сохранено. Проверьте имя, телефон и дату и отправьте ещё раз.",
  "error.unavailable": "Сервис записи сейчас недоступен",
  "error.unavailableHint":
    "Это не ошибка в ваших данных — они сохранены. Попробуйте отправить ещё раз через минуту.",
  "error.identity": "Откройте запись из Telegram",
  "error.identityHint":
    "Салон подтверждает запись через Telegram. Всё введённое сохранено — откройте мини-приложение заново и отправьте ещё раз.",

  /* Cancellation from the bookings list. These errors replace the generic one
     for a customer-side cancel so the reason is specific instead of generic. */
  "booking.cancelErrorUnverified": "Откройте запись из Telegram",
  "booking.cancelErrorUnverifiedHint":
    "Салон подтверждает запись через Telegram. Бронь пока осталась — откройте мини-приложение заново и попробуйте снова.",
  "booking.cancelErrorAccess": "Эта бронь вам не принадлежит",
  "booking.cancelErrorConflict": "Бронь изменилась, попробуйте снова",
  "booking.cancelErrorConflictHint":
    "Запись могла измениться, пока шла проверка. Она осталась — попробуйте отменить ещё раз.",
  "booking.cancelErrorNotFound": "Эта бронь более не доступна",
  "booking.cancelErrorUnavailable": "Сервис отмены сейчас недоступен",
  "booking.cancelErrorUnavailableHint":
    "Это не ваша ошибка — бронь пока не отменена. Попробуйте снова через минуту.",

  /* Message shown when cancel is in flight, per booking row. */
  "booking.cancelInProgress": "Отмена…",

  "action.next": "Далее",
  "action.back": "Назад",
  "action.change": "Изменить",
  "action.selected": "Выбрано: {count}",
  "action.close": "Закрыть",

  "lang.label": "Язык",
  "form.title": "Новый бизнес",
  "form.hint": "Название и телефон — остальное агенты достроят сами",
  "form.name": "Название бизнеса",
  "form.namePlaceholder": "Салон Зарнигор",
  "form.phone": "Телефон",
  "form.kind": "Вид бизнеса",
  "form.subdomain": "Поддомен",
  "form.subdomainEmpty": "появится из названия",
  "form.submit": "Создать проект",
  "form.sending": "Создаю",
  "form.created": "Запись салона создана",
  "form.openTenant": "Открыть Mini App",
  "form.another": "Создать ещё один",
  "form.errName": "Введите название, минимум 2 символа",
  "form.errPhone": "Введите номер в формате +998 90 123 45 67",
  "list.loading": "Загружаю проекты",
  "list.empty": "Пока ни одного проекта",
  "list.demo": "Показаны демо-проекты: Supabase не подключён",
  "list.refresh": "Обновить",
  "list.source": "GET /api/admin/salons",
  "run.notPersisted": "Создано без записи в базу",

  /* Save state — the four outcomes any write can have. */
  "save.saved": "Создано и сохранено",
  "save.savedHint": "Запись есть в базе Supabase — сервер подтвердил и перечитал её.",
  "save.notSaved": "Не сохранено",
  "save.notSavedHint":
    "Сервер ответил, но запись не попала в базу. Данные остались только в этом браузере — повторите позже.",
  "save.unavailable": "Supabase временно недоступен",
  "save.unavailableHint":
    "База не отвечает, поэтому записать было некуда. Данные остались только в этом браузере.",
  "save.unknown": "Статус сохранения неизвестен",
  "save.unknownHint":
    "Сервер не сообщил, сохранена ли запись. Считаем её несохранённой, пока не подтвердит.",
  "save.checking": "Проверяю сохранение",
  "save.retry": "Повторить сохранение",

  /* Provenance of a record in the admin table and the booking list. */
  "origin.server": "Сохранено на сервере",
  "origin.local": "Только в этом браузере",
  "origin.demo": "Демо-данные",
  "origin.serverShort": "Сервер",
  "origin.localShort": "Локально",
  "origin.demoShort": "Демо",

  /* Console outcome — replaces "finished in Ns" as the success signal. */
  "console.outcomeSaved": "Запись салона создана и сохранена за {seconds} с",
  "console.outcomeUnsaved": "Работа завершена за {seconds} с, но запись салона не сохранена",
  "console.streamDone": "Процесс завершён за {seconds} с",
  "console.tenantUnsaved": "Поддомен не заработает, пока запись салона не сохранена",

  /* Booking flow. */
  "booking.createdSaved": "Запись создана и сохранена",
  "booking.createdSavedHint": "Салон уже видит её. Мы напомним за час до визита.",
  "booking.createdUnsaved": "Запись не сохранена на сервере",
  "booking.createdUnsavedHint":
    "Она видна только на этом устройстве — салон её ещё не получил. Позвоните, чтобы подтвердить визит.",
  "booking.notSavedRow": "Салон эту запись не получил",
  "booking.demoRow": "Демо-запись, не настоящая",

  /* Admin data provenance. */
  "admin.sourceTitle": "Источник данных",
  "admin.sourceDemo": "Показаны демо-данные: это не записи из Supabase",
  "admin.sourceLocal":
    "Записи взяты из localStorage этого браузера, а не из Supabase. На другом устройстве их не будет.",
  "admin.sourceMixed":
    "Часть записей сохранена на сервере, часть — только в этом браузере. Проверьте метку в строке.",
  "admin.countsLine": "сервер {server} · локально {local} · демо {demo}",
  "admin.realOnly": "Только сохранённые",
  "admin.todayRealNote": "Суммы считаются без демо-записей",
  "admin.serviceLocalOnly":
    "Цены меняются только в этой сессии и в Supabase не сохраняются.",
  "console.projects": "Проекты",
  "console.projectsHint": "{count} поддоменов на платформе",
  "console.newProject": "Новый проект",
  "console.command": "Командный центр",
  "console.commandHint":
    "Опишите бизнес словами — консоль подготовит запись салона и поддомен для пилота",
  "console.promptLabel": "Что за бизнес",
  "console.promptPlaceholder": "Кофейня в Чиланзаре: меню с фото, предзаказ навынос, оплата Payme",
  "console.templates": "Готовые шаблоны",
  "console.build": "Создать запись",
  "console.building": "Создаю запись",
  "console.reviewTitle": "Проверьте запись салона",
  "console.reviewHint": "Запись появится только после вашего подтверждения.",
  "console.reviewEdit": "Изменить",
  "console.confirmBuild": "Подтвердить и создать запись",

  /* AI proposals — optional, and applied only by an explicit click. */
  "ai.ask": "Спросить ИИ",
  "ai.asking": "Спрашиваю ИИ…",
  "ai.askHint": "Необязательно: ИИ предложит уточнения. Запись создаётся и без него.",
  "ai.title": "Предложения ИИ",
  "ai.hint":
    "Ничего не изменено. Каждое поле применяется только по кнопке рядом с ним.",
  "ai.current": "сейчас",
  "ai.proposed": "предложено",
  "ai.currentEmpty": "не заполнено",
  "ai.apply": "Применить",
  "ai.replace": "Заменить",
  "ai.applied": "Применено",
  "ai.empty": "ИИ не нашёл новых значений — заполните поля вручную.",
  "ai.unavailable":
    "ИИ сейчас недоступен. Уточните название, вид и телефон вручную — на создание записи это не влияет.",
  "console.log": "Лог агентов",
  "console.logIdle": "Агенты ждут задачу",
  "console.logIdleHint": "Опишите приложение или выберите шаблон",
  "console.done": "Готово за {seconds} с",
  "console.open": "Открыть",
  "console.bookingsToday": "{count} записей сегодня",
  "console.progress": "{percent}% собрано",
  "console.touchedNow": "только что",
  "console.touchedMin": "{count} мин назад",
  "console.touchedHour": "{count} ч назад",
  "console.touchedDay": "{count} дн назад",
  "console.stage.schema": "Схема Supabase",
  "console.stage.domain": "Поддомен и TLS",
  "console.stage.ui": "Сборка интерфейса",
  "console.stage.deploy": "Деплой",
  "console.status.live": "Работает",
  "console.status.building": "Собирается",
  "console.status.queued": "В очереди",
  "console.status.paused": "На паузе",
  "console.status.failed": "Ошибка",
  "tpl.salon": "Салон красоты",
  "tpl.cafe": "Кофейня",
  "tpl.carwash": "Автомойка",
  "tpl.salonHint": "Услуги, мастера, запись",
  "tpl.cafeHint": "Меню, предзаказ, лояльность",
  "tpl.carwashHint": "Тарифы, боксы, время",
  "tpl.salonPrompt":
    "Салон красоты и барбершоп в Ташкенте: услуги с ценами, мастера, запись на свободное время",
  "tpl.cafePrompt":
    "Кофейня: меню с фото, предзаказ навынос, оплата Payme и Click",
  "tpl.carwashPrompt":
    "Автомойка с детейлингом: тарифы, свободные боксы, запись по времени",

  "tpl.custom": "Своё приложение",

  "console.detected": "Распознано из описания",
  "console.detectedNothing": "Из описания пока ничего не распознано — заполните поля ниже",
  "console.fromPrompt": "из промпта",
  "console.promptHint": "Чем конкретнее описание, тем меньше придётся дозаполнять руками",
  "form.errPrompt": "Опишите бизнес или выберите шаблон",
  "tenant.building": "Проект ещё собирается",
  "tenant.buildingHint": "Агенты заканчивают сборку. Загляните чуть позже.",
  "tenant.missing": "Такого проекта нет",
  "tenant.toConsole": "В консоль платформы",

  "cat.all": "Все",
  "pay.method": "Способ оплаты",
  "tma.notChosen": "Не выбрано",
  "tma.contacts": "Контакты",

  "admin.title": "Панель администратора",
  "admin.todayTitle": "На сегодня",
  "admin.todaySum": "В сумме",
  "admin.demoBooking": "Добавить тестовую запись",
  "admin.bookingsTitle": "Все записи",
  "admin.noBookings": "Записей нет",
  "admin.showing": "Показано",
  "admin.entries": "записи",
  "admin.colDate": "Дата",
  "admin.colTime": "Время",
  "admin.colClient": "Клиент",
  "admin.colServices": "Услуги",
  "admin.colMaster": "Мастер",
  "admin.colSum": "Сумма",
  "admin.colStatus": "Статус",
  "admin.colActions": "Действия",
  "admin.confirm": "Подтвердить",
  "admin.markPaid": "Отметить оплату",
  "admin.cancel": "Отменить",
  "admin.delete": "Удалить",
  "admin.cancelBooking": "Отменить запись",
  "admin.deleteBooking": "Удалить запись",
  "admin.pageOf": "Страница {current} из {total}",
  "admin.servicesTitle": "Услуги и цены",
  "admin.servicesHint": "Редактируйте цены в суммах. Изменения сохраняются в памяти.",
  "admin.addService": "Добавить услугу",
  "admin.removeService": "Удалить услугу",
  "admin.priceInput": "Цена в сумах",
  "admin.ownedBy": "Салон",
} as const;


export type MessageKey = keyof typeof ru;

const uz: Record<MessageKey, string> = {
  "nav.book": "Band qilish",
  "nav.bookings": "Mening bandlovlarim",
  "nav.salon": "Salon",

  "salon.openToday": "Bugun {time} gacha",
  "salon.reviews": "{count} ta sharh",
  "salon.call": "Qoʻngʻiroq qilish",
  "salon.route": "Qanday borish",

  "home.servicesTitle": "Nima qilamiz",
  "home.servicesHint": "Bir nechtasini tanlashingiz mumkin — vaqt va narxni qoʻshamiz",
  "home.popular": "Eng koʻp tanlanadi",
  "home.mastersTitle": "Ustalar",
  "home.mastersHint": "Aniq ustaga yoki birinchi boʻsh ustaga yoziling",

  "group.hair": "Soch",
  "group.beard": "Soqol",
  "group.color": "Boʻyash",
  "group.nails": "Tirnoqlar",
  "group.brows": "Qosh va kipriklar",

  "step.services": "Xizmatlar",
  "step.master": "Usta",
  "step.time": "Vaqt",
  "step.confirm": "Tasdiqlash",
  "step.of": "{total} dan {current}-qadam",

  "master.anyTitle": "Birinchi boʻsh usta",
  "master.anyHint": "Tanlangan vaqtga usta topamiz",
  "master.worksToday": "Bugun ishlaydi",
  "master.dayOff": "Bugun dam oladi",
  "master.cannotDoAll": "Tanlangan barcha xizmatlarni bajarmaydi",

  "time.pickDay": "Kunni tanlang",
  "time.pickSlot": "Boʻsh vaqt",
  "time.noSlots": "Bu kun toʻliq band. Boshqa kunni tanlang.",
  "time.morning": "Ertalab",
  "time.day": "Kunduzi",
  "time.evening": "Kechqurun",
  "time.taken": "band",
  "time.today": "Bugun",
  "time.tomorrow": "Ertaga",

  "confirm.title": "Bandlovni tekshiring",
  "confirm.when": "Qachon",
  "confirm.who": "Usta",
  "confirm.what": "Xizmatlar",
  "confirm.duration": "Davomiyligi",
  "confirm.total": "Toʻlov",
  "confirm.name": "Ismingiz",
  "confirm.namePlaceholder": "Sizni qanday chaqiraylik",
  "confirm.phone": "Telefon",
  "confirm.payLater": "Salonda toʻlash",
  "confirm.payNow": "Onlayn toʻlash",
  "confirm.submit": "Band qilish",
  "confirm.sending": "Band qilinmoqda…",

  "booking.created": "Siz band qildingiz",
  "booking.createdHint": "Tashrifdan ikki soat oldin Telegramda eslatamiz",
  "booking.toBookings": "Bandlovlarimni ochish",
  "booking.cancel": "Bandlovni bekor qilish",
  "booking.empty": "Hozircha bandlov yoʻq",
  "booking.emptyHint": "Xizmatni tanlang — bir daqiqadan kam vaqt ketadi",
  "booking.emptyCta": "Xizmatni tanlash",

  "status.pending": "Tasdiqlanishi kutilmoqda",
  "status.confirmed": "Tasdiqlangan",
  "status.paid": "Toʻlangan",
  "status.cancelled": "Bekor qilingan",
  "status.draft": "Qoralama",
  "status.all": "Barchasi",

  "pay.title": "Toʻlov",
  "pay.hint": "Faqat xizmat narxini yechamiz, komissiyasiz",
  "pay.click": "Click",
  "pay.payme": "Payme",
  "pay.cash": "Salonda naqd pul bilan",
  "pay.submit": "Toʻlovga oʻtish",
  "pay.stub": "Toʻlov shlyuzi hali ulanmagan. Tugma hozircha {provider} ga qanday soʻrov ketishini koʻrsatadi.",
  "pay.back": "Bandlovga qaytish",

  "error.pickService": "Kamida bitta xizmatni tanlang",
  "error.pickMaster": "Ustani tanlang",
  "error.pickTime": "Kun va vaqtni tanlang",
  "error.name": "Ismingizni kiriting",
  "error.phone": "Raqamni +998 90 123 45 67 koʻrinishida kiriting",
  "error.generic": "Bandlovni saqlay olmadik. Yana urinib koʻring.",
  "error.genericHint": "Kiritganlaringiz saqlandi — yana yuborib koʻrishingiz mumkin.",
  /* Refusals from the booking API: each one names the cause and says what
     happened to the entered data. */
  "error.slotTaken": "Bu vaqtni hozir band qilishdi",
  "error.slotTakenHint":
    "Xizmatlar, usta, sana va kontaktlaringiz saqlandi. Boshqa vaqtni tanlang — qaytadan toʻldirish shart emas.",
  "error.rejected": "Salon bu maʼlumotlarni qabul qilmadi",
  "error.rejectedHint":
    "Kiritganlaringiz saqlandi. Ism, telefon va sanani tekshirib, yana yuboring.",
  "error.unavailable": "Bandlov xizmati hozir ishlamayapti",
  "error.unavailableHint":
    "Bu sizning maʼlumotlaringizdagi xato emas — ular saqlandi. Bir daqiqadan soʻng yana yuborib koʻring.",
  "error.identity": "Bandlovni Telegram orqali oching",
  "error.identityHint":
    "Salon bandlovni Telegram orqali tasdiqlaydi. Kiritganlaringiz saqlandi — mini-ilovani qaytadan oching va yana yuboring.",

  /* Cancellation from the bookings list. These errors replace the generic one
     for a customer-side cancel so the reason is specific instead of generic. */
  "booking.cancelErrorUnverified": "Bandlovni Telegram orqali oching",
  "booking.cancelErrorUnverifiedHint":
    "Salon bandlovni Telegram orqali tasdiqlaydi. Bandlov hali qoldi — mini-ilovani qayta oching va yana urinib ko'ring.",
  "booking.cancelErrorAccess": "Bu bandlov sizga tegishli emas",
  "booking.cancelErrorConflict": "Bandlov o'zgarib ketdi, qayta urinib ko'ring",
  "booking.cancelErrorConflictHint":
    "Tekshirish yurganida bandlov o'zgariishi mumkin edi. U hali qoldi — yana urinib ko'ring.",
  "booking.cancelErrorNotFound": "Bu bandlov endi topilmadi",
  "booking.cancelErrorUnavailable": "Bekor qilish xizmati hozir ishlamayapti",
  "booking.cancelErrorUnavailableHint":
    "Bu sizning xatangiz emas — bandlov hali bekor qilingan emas. Bir daqiqadan so'ng yana urinib ko'ring.",

  /* Message shown when cancel is in flight, per booking row. */
  "booking.cancelInProgress": "Bekor qilmoqdamiz…",

  "action.next": "Keyingi",
  "action.back": "Orqaga",
  "action.change": "Oʻzgartirish",
  "action.selected": "Tanlangan: {count}",
  "action.close": "Yopish",

  "lang.label": "Til",
  "form.title": "Yangi biznes",
  "form.hint": "Nom va telefon — qolganini agentlar oʻzi qiladi",
  "form.name": "Biznes nomi",
  "form.namePlaceholder": "Salon Zarnigor",
  "form.phone": "Telefon",
  "form.kind": "Biznes turi",
  "form.subdomain": "Subdomen",
  "form.subdomainEmpty": "nomdan hosil boʻladi",
  "form.submit": "Loyiha yaratish",
  "form.sending": "Yaratilmoqda",
  "form.created": "Salon yozuvi yaratildi",
  "form.openTenant": "Mini App ni ochish",
  "form.another": "Yana bitta yaratish",
  "form.errName": "Nomni kiriting, kamida 2 belgi",
  "form.errPhone": "Raqamni +998 90 123 45 67 koʻrinishida kiriting",
  "list.loading": "Loyihalar yuklanmoqda",
  "list.empty": "Hozircha loyiha yoʻq",
  "list.demo": "Demo loyihalar koʻrsatilgan: Supabase ulanmagan",
  "list.refresh": "Yangilash",
  "list.source": "GET /api/admin/salons",
  "run.notPersisted": "Bazaga yozilmasdan yaratildi",

  /* Save state — the four outcomes any write can have. */
  "save.saved": "Yaratildi va saqlandi",
  "save.savedHint": "Yozuv Supabase bazasida — server tasdiqlab, qayta oʻqib koʻrdi.",
  "save.notSaved": "Saqlanmadi",
  "save.notSavedHint":
    "Server javob berdi, lekin yozuv bazaga tushmadi. Maʼlumot faqat shu brauzerda qoldi — keyinroq qayta urinib koʻring.",
  "save.unavailable": "Supabase vaqtincha ishlamayapti",
  "save.unavailableHint":
    "Baza javob bermadi, shuning uchun yozishga joy boʻlmadi. Maʼlumot faqat shu brauzerda qoldi.",
  "save.unknown": "Saqlanish holati aniq emas",
  "save.unknownHint":
    "Server saqlangani haqida hech narsa demadi. Tasdiqlanmaguncha saqlanmagan deb hisoblaymiz.",
  "save.checking": "Saqlanish tekshirilmoqda",
  "save.retry": "Saqlashni qayta urinish",

  /* Provenance of a record in the admin table and the booking list. */
  "origin.server": "Serverda saqlangan",
  "origin.local": "Faqat shu brauzerda",
  "origin.demo": "Demo maʼlumot",
  "origin.serverShort": "Server",
  "origin.localShort": "Lokal",
  "origin.demoShort": "Demo",

  /* Console outcome — replaces "finished in Ns" as the success signal. */
  "console.outcomeSaved": "Salon yozuvi {seconds} s da yaratildi va saqlandi",
  "console.outcomeUnsaved": "Ish {seconds} s da tugadi, lekin salon yozuvi saqlanmadi",
  "console.streamDone": "Jarayon {seconds} s da tugadi",
  "console.tenantUnsaved": "Salon yozuvi saqlanmaguncha subdomen ishlamaydi",

  /* Booking flow. */
  "booking.createdSaved": "Bandlov yaratildi va saqlandi",
  "booking.createdSavedHint": "Salon allaqachon koʻrib turibdi. Tashrifdan bir soat oldin eslatamiz.",
  "booking.createdUnsaved": "Bandlov serverda saqlanmadi",
  "booking.createdUnsavedHint":
    "U faqat shu qurilmada koʻrinadi — salon hali olmadi. Tashrifni tasdiqlash uchun qoʻngʻiroq qiling.",
  "booking.notSavedRow": "Salon bu bandlovni olmagan",
  "booking.demoRow": "Demo bandlov, haqiqiy emas",

  /* Admin data provenance. */
  "admin.sourceTitle": "Maʼlumot manbasi",
  "admin.sourceDemo": "Demo maʼlumot koʻrsatilgan: bu Supabase yozuvlari emas",
  "admin.sourceLocal":
    "Yozuvlar Supabase dan emas, shu brauzer localStorage idan olingan. Boshqa qurilmada ular boʻlmaydi.",
  "admin.sourceMixed":
    "Bir qism yozuv serverda saqlangan, bir qismi faqat shu brauzerda. Qatordagi belgiga qarang.",
  "admin.countsLine": "server {server} · lokal {local} · demo {demo}",
  "admin.realOnly": "Faqat saqlanganlar",
  "admin.todayRealNote": "Summalar demo yozuvlarsiz hisoblanadi",
  "admin.serviceLocalOnly":
    "Narxlar faqat shu sessiyada oʻzgaradi va Supabase ga saqlanmaydi.",
  "console.projects": "Loyihalar",
  "console.projectsHint": "platformada {count} ta subdomen",
  "console.newProject": "Yangi loyiha",
  "console.command": "Buyruq markazi",
  "console.commandHint":
    "Biznesni soʻz bilan tasvirlang — konsol pilot uchun salon yozuvi va subdomenni tayyorlaydi",
  "console.promptLabel": "Qanday biznes",
  "console.promptPlaceholder": "Chilonzorda qahvaxona: rasmli menyu, olib ketishga buyurtma, Payme toʻlovi",
  "console.templates": "Tayyor shablonlar",
  "console.build": "Yozuv yaratish",
  "console.building": "Yozuv yaratilmoqda",
  "console.reviewTitle": "Salon yozuvini tekshiring",
  "console.reviewHint": "Yozuv faqat tasdiqlaganingizdan keyin yaratiladi.",
  "console.reviewEdit": "Oʻzgartirish",
  "console.confirmBuild": "Tasdiqlash va yozuv yaratish",

  /* AI proposals — optional, and applied only by an explicit click. */
  "ai.ask": "AI dan soʻrash",
  "ai.asking": "AI soʻralmoqda…",
  "ai.askHint": "Majburiy emas: AI aniqlashtirishlarni taklif qiladi. Usiz ham yozuv yaratiladi.",
  "ai.title": "AI takliflari",
  "ai.hint":
    "Hech narsa oʻzgartirilmadi. Har bir maydon faqat yonidagi tugma bosilganda qoʻllanadi.",
  "ai.current": "hozir",
  "ai.proposed": "taklif",
  "ai.currentEmpty": "toʻldirilmagan",
  "ai.apply": "Qoʻllash",
  "ai.replace": "Almashtirish",
  "ai.applied": "Qoʻllandi",
  "ai.empty": "AI yangi qiymat topmadi — maydonlarni qoʻlda toʻldiring.",
  "ai.unavailable":
    "AI hozir ishlamayapti. Nom, tur va telefonni qoʻlda aniqlashtiring — bu yozuv yaratishga xalal bermaydi.",
  "console.log": "Agentlar jurnali",
  "console.logIdle": "Agentlar vazifa kutmoqda",
  "console.logIdleHint": "Ilovani tasvirlang yoki shablon tanlang",
  "console.done": "{seconds} s da tayyor",
  "console.open": "Ochish",
  "console.bookingsToday": "Bugun {count} ta bandlov",
  "console.progress": "{percent}% yigʻildi",
  "console.touchedNow": "hozir",
  "console.touchedMin": "{count} daqiqa oldin",
  "console.touchedHour": "{count} soat oldin",
  "console.touchedDay": "{count} kun oldin",
  "console.stage.schema": "Supabase sxemasi",
  "console.stage.domain": "Subdomen va TLS",
  "console.stage.ui": "Interfeys yigʻilishi",
  "console.stage.deploy": "Deploy",
  "console.status.live": "Ishlayapti",
  "console.status.building": "Yigʻilmoqda",
  "console.status.queued": "Navbatda",
  "console.status.paused": "Toʻxtatilgan",
  "console.status.failed": "Xato",
  "tpl.salon": "Goʻzallik saloni",
  "tpl.cafe": "Qahvaxona",
  "tpl.carwash": "Avtomoyka",
  "tpl.salonHint": "Xizmatlar, ustalar, bandlov",
  "tpl.cafeHint": "Menyu, oldindan buyurtma, lojalik",
  "tpl.carwashHint": "Tariflar, bokslar, vaqt",
  "tpl.salonPrompt":
    "Toshkentda goʻzallik saloni va barbershop: narxli xizmatlar, ustalar, boʻsh vaqtga bandlov",
  "tpl.cafePrompt":
    "Qahvaxona: rasmli menyu, olib ketishga oldindan buyurtma, Payme va Click toʻlovi",
  "tpl.carwashPrompt":
    "Detalling bilan avtomoyka: tariflar, boʻsh bokslar, vaqtga bandlov",

  "tpl.custom": "Oʻz ilovasi",

  "console.detected": "Tavsifdan aniqlandi",
  "console.detectedNothing": "Tavsifdan hozircha hech narsa aniqlanmadi — pastdagi maydonlarni toʻldiring",
  "console.fromPrompt": "promptdan",
  "console.promptHint": "Tavsif qanchalik aniq boʻlsa, qoʻlda toʻldirish shunchalik kam",
  "form.errPrompt": "Biznesni tasvirlang yoki shablon tanlang",
  "tenant.building": "Loyiha hali yigʻilmoqda",
  "tenant.buildingHint": "Agentlar yigʻishni tugatmoqda. Birozdan keyin kiring.",
  "tenant.missing": "Bunday loyiha yoʻq",
  "tenant.toConsole": "Platforma konsoliga",

  "cat.all": "Barchasi",
  "pay.method": "Toʻlov usuli",
  "tma.notChosen": "Tanlanmagan",
  "tma.contacts": "Aloqa",

  "admin.title": "Admindan foydalanish",
  "admin.todayTitle": "Bugun",
  "admin.todaySum": "Jami",
  "admin.demoBooking": "Test bandini qo'shish",
  "admin.bookingsTitle": "Barcha bandlovlar",
  "admin.noBookings": "Bandlovlar yo'q",
  "admin.showing": "Ko'rsatilgan",
  "admin.entries": "ta bandlov",
  "admin.colDate": "Sana",
  "admin.colTime": "Vaqt",
  "admin.colClient": "Mijoz",
  "admin.colServices": "Xizmatlar",
  "admin.colMaster": "Usta",
  "admin.colSum": "Summa",
  "admin.colStatus": "Holat",
  "admin.colActions": "Harakatlar",
  "admin.confirm": "Tasdiqlash",
  "admin.markPaid": "To'lovni belgilash",
  "admin.cancel": "Bekor qilish",
  "admin.delete": "O'chirish",
  "admin.cancelBooking": "Bandlovni bekor qilish",
  "admin.deleteBooking": "Bandlovni o'chirish",
  "admin.pageOf": "{total} saytdan {current}-sayt",
  "admin.servicesTitle": "Xizmatlar va narxlar",
  "admin.servicesHint": "Narxlarni so'mda tahrirlang. O'zgarishlar xotirada saqlanadi.",
  "admin.addService": "Xizmat qo'shish",
  "admin.removeService": "Xizmatni o'chirish",
  "admin.priceInput": "So'mdagi narx",
  "admin.ownedBy": "Salon",
};


export const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  ru,
  uz,
};

export const LOCALE_NAMES: Record<Locale, string> = {
  ru: "Русский",
  uz: "Oʻzbekcha",
};
