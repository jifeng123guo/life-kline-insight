
// @ts-ignore
const { Solar, Lunar } = window;

export function getBaziData(date: string, time: string, gender: 'Male' | 'Female') {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const lunar = solar.getLunar();
  const baZi = lunar.getEightChar();
  
  // Pillars
  const yearPillar = baZi.getYear();
  const monthPillar = baZi.getMonth();
  const dayPillar = baZi.getDay();
  const hourPillar = baZi.getTime();
  
  // DaYun Calculation
  // Determine direction: Male + Yang Year / Female + Yin Year = Forward
  const yearStem = yearPillar.charAt(0);
  const yangStems = ['甲', '丙', '戊', '庚', '壬'];
  const isYangYear = yangStems.includes(yearStem);
  
  const isForward = (gender === 'Male' && isYangYear) || (gender === 'Female' && !isYangYear);
  
  const yun = baZi.getYun(gender === 'Male' ? 1 : 0);
  const startAge = yun.getStartYear();
  const daYunList = yun.getDaYun();
  const firstDaYun = daYunList[1].getGanZhi(); // List[0] is often pre-start info

  return {
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    startAge,
    firstDaYun,
    isForward,
    birthYear: year
  };
}
