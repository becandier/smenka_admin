// Список IANA-таймзон для селекта «Часовой пояс организации» (work_schedules/backend.md:
// `organizations.timezone`). Российские зоны — полностью (11 часовых поясов РФ), плюс основные
// зоны СНГ (ТЗ admin.md: «нужен хотя бы список российских зон + основные СНГ»). id — ровно то,
// что уходит в PATCH /organizations/{org} и резолвится через zoneinfo.ZoneInfo на бэке.
export interface TimezoneOption {
  id: string;
  name: string;
}

export const TIMEZONE_CHOICES: TimezoneOption[] = [
  // Россия (запад → восток)
  { id: 'Europe/Kaliningrad', name: 'Калининград (UTC+2)' },
  { id: 'Europe/Moscow', name: 'Москва (UTC+3)' },
  { id: 'Europe/Samara', name: 'Самара (UTC+4)' },
  { id: 'Asia/Yekaterinburg', name: 'Екатеринбург (UTC+5)' },
  { id: 'Asia/Omsk', name: 'Омск (UTC+6)' },
  { id: 'Asia/Novosibirsk', name: 'Новосибирск (UTC+7)' },
  { id: 'Asia/Barnaul', name: 'Барнаул (UTC+7)' },
  { id: 'Asia/Tomsk', name: 'Томск (UTC+7)' },
  { id: 'Asia/Novokuznetsk', name: 'Новокузнецк (UTC+7)' },
  { id: 'Asia/Krasnoyarsk', name: 'Красноярск (UTC+7)' },
  { id: 'Asia/Irkutsk', name: 'Иркутск (UTC+8)' },
  { id: 'Asia/Chita', name: 'Чита (UTC+9)' },
  { id: 'Asia/Yakutsk', name: 'Якутск (UTC+9)' },
  { id: 'Asia/Khandyga', name: 'Хандыга (UTC+9)' },
  { id: 'Asia/Vladivostok', name: 'Владивосток (UTC+10)' },
  { id: 'Asia/Ust-Nera', name: 'Усть-Нера (UTC+10)' },
  { id: 'Asia/Magadan', name: 'Магадан (UTC+11)' },
  { id: 'Asia/Sakhalin', name: 'Южно-Сахалинск (UTC+11)' },
  { id: 'Asia/Srednekolymsk', name: 'Среднеколымск (UTC+11)' },
  { id: 'Asia/Kamchatka', name: 'Петропавловск-Камчатский (UTC+12)' },
  { id: 'Asia/Anadyr', name: 'Анадырь (UTC+12)' },
  // СНГ
  { id: 'Europe/Minsk', name: 'Минск, Беларусь (UTC+3)' },
  { id: 'Europe/Kyiv', name: 'Киев, Украина (UTC+2)' },
  { id: 'Europe/Chisinau', name: 'Кишинёв, Молдова (UTC+2)' },
  { id: 'Asia/Yerevan', name: 'Ереван, Армения (UTC+4)' },
  { id: 'Asia/Baku', name: 'Баку, Азербайджан (UTC+4)' },
  { id: 'Asia/Tbilisi', name: 'Тбилиси, Грузия (UTC+4)' },
  { id: 'Asia/Aqtau', name: 'Актау, Казахстан (UTC+5)' },
  { id: 'Asia/Aqtobe', name: 'Актобе, Казахстан (UTC+5)' },
  { id: 'Asia/Atyrau', name: 'Атырау, Казахстан (UTC+5)' },
  { id: 'Asia/Oral', name: 'Уральск, Казахстан (UTC+5)' },
  { id: 'Asia/Ashgabat', name: 'Ашхабад, Туркменистан (UTC+5)' },
  { id: 'Asia/Dushanbe', name: 'Душанбе, Таджикистан (UTC+5)' },
  { id: 'Asia/Samarkand', name: 'Самарканд, Узбекистан (UTC+5)' },
  { id: 'Asia/Tashkent', name: 'Ташкент, Узбекистан (UTC+5)' },
  { id: 'Asia/Bishkek', name: 'Бишкек, Киргизия (UTC+6)' },
  { id: 'Asia/Almaty', name: 'Алматы, Казахстан (UTC+6)' },
  { id: 'Asia/Qyzylorda', name: 'Кызылорда, Казахстан (UTC+5)' },
];

export const DEFAULT_ORG_TIMEZONE = 'Europe/Moscow';
