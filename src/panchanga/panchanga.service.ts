import { Injectable } from "@nestjs/common";
import * as sweph from "sweph";
import {
  PanchangaDate,
  Location,
  TithiResult,
  NakshatraResult,
  YogaResult,
  KaranaResult,
  MasaResult,
  PanchangaResult,
} from "./interfaces/panchanga.interface";

// Swiss Ephemeris constants (since they're not exported from the package)
const SE_SUN = 0;
const SE_MOON = 1;
const SE_GREG_CAL = 1;
const SEFLG_SWIEPH = 2;
const SE_CALC_RISE = 1;
const SE_CALC_SET = 2;
const SE_SIDM_LAHIRI = 1;
const SE_BIT_DISC_CENTER = 256;

interface MatchingDate {
  date: PanchangaDate;
  fields: {
    tithi: number;
    paksha: string; // Add this property
    nakshatra: number;
    yoga: number;
    karana: number;
    masa: number;
    vaara: number;
  };
}

@Injectable()
export class PanchangaService {
  constructor() {
    // Initialize Swiss Ephemeris
    sweph.set_ephe_path("");
  }

  /**
   * Convert degrees, minutes, seconds to decimal degrees
   */
  private fromDms(degs: number, mins: number, secs: number): number {
    return degs + mins / 60 + secs / 3600;
  }

  /**
   * Convert decimal degrees to degrees, minutes, seconds
   */
  private toDms(deg: number): number[] {
    const d = Math.floor(deg);
    const mins = (deg - d) * 60;
    const m = Math.floor(mins);
    let s = Math.round((mins - m) * 60);
    let mm = m;
    let dd = d;
    // Normalize any rollover (e.g. 08:29:60 -> 08:30:00)
    if (s === 60) {
      s = 0;
      mm += 1;
    }
    if (mm === 60) {
      mm = 0;
      dd += 1;
    }
    return [dd, mm, s];
  }

  /**
   * Convert Gregorian date to Julian Day Number
   */
  public gregorianToJd(date: PanchangaDate): number {
    const hour = date.hour ?? 0;
    const minute = date.minute ?? 0;
    const dayFraction = (hour + minute / 60) / 24;
    const cal = (date.calendar || "gregorian").toLowerCase();
    if (cal === "julian") {
      // Julian calendar flag 0
      return sweph.julday(date.year, date.month, date.day, dayFraction * 24, 0);
    }
    // Default Gregorian
    return sweph.julday(
      date.year,
      date.month,
      date.day,
      dayFraction * 24,
      SE_GREG_CAL
    );
  }

  /**
   * Convert Julian Day Number to Gregorian date
   */
  private jdToGregorian(jd: number): PanchangaDate {
    const result = sweph.revjul(jd, SE_GREG_CAL);
    return {
      year: result.year,
      month: result.month,
      day: result.day,
    };
  }

  /**
   * Get solar longitude at given Julian Day
   */
  private solarLongitude(jd: number): number {
    try {
      const result = sweph.calc_ut(jd, SE_SUN, SEFLG_SWIEPH);
      if (result.error && !result.data) {
        console.error("Solar longitude calculation error:", result.error);
        return 0;
      }
      // sweph returns data as array where data[0] is longitude
      return result.data?.[0] || 0;
    } catch (error) {
      console.error("Error in solarLongitude:", error);
      return 0;
    }
  }

  /**
   * Get lunar longitude at given Julian Day
   */
  private lunarLongitude(jd: number): number {
    try {
      const result = sweph.calc_ut(jd, SE_MOON, SEFLG_SWIEPH);
      if (result.error && !result.data) {
        console.error("Lunar longitude calculation error:", result.error);
        return 0;
      }
      // sweph returns data as array where data[0] is longitude
      return result.data?.[0] || 0;
    } catch (error) {
      console.error("Error in lunarLongitude:", error);
      return 0;
    }
  }

  /**
   * Get lunar latitude at given Julian Day
   */
  private lunarLatitude(jd: number): number {
    try {
      const result = sweph.calc_ut(jd, SE_MOON, SEFLG_SWIEPH);
      if (result.error && !result.data) {
        console.error("Lunar latitude calculation error:", result.error);
        return 0;
      }
      // sweph returns data as array where data[1] is latitude
      return result.data?.[1] || 0;
    } catch (error) {
      console.error("Error in lunarLatitude:", error);
      return 0;
    }
  }

  /**
   * Calculate sunrise time
   */
  private sunrise(jd: number, location: Location): number[] {
    const { latitude, longitude, timezone } = location;
    const result = sweph.rise_trans(
      jd - timezone / 24,
      SE_SUN,
      "",
      SEFLG_SWIEPH,
      SE_BIT_DISC_CENTER + SE_CALC_RISE,
      [longitude, latitude, 0],
      1013.25,
      15
    );

    if (result.error)
      throw new Error(`Sunrise calculation error: ${result.error}`);

    const rise = result.data; // JD (UT)
    const localHours = (rise - jd) * 24 + timezone; // convert JD → local hours
    return this.toDms(localHours);
  }

  /**
   * Calculate sunset time
   */
  private sunset(jd: number, location: Location): number[] {
    const { latitude, longitude, timezone } = location;
    const result = sweph.rise_trans(
      jd - timezone / 24,
      SE_SUN,
      "",
      SEFLG_SWIEPH,
      SE_BIT_DISC_CENTER + SE_CALC_SET,
      [longitude, latitude, 0],
      1013.25,
      15
    );

    if (result.error)
      throw new Error(`Sunset calculation error: ${result.error}`);

    const setting = result.data; // JD (UT)
    const localHours = (setting - jd) * 24 + timezone; // convert JD → local hours
    return this.toDms(localHours);
  }

  /**
   * Calculate moonrise time
   */
  private moonrise(jd: number, location: Location): number[] {
    const { latitude, longitude, timezone } = location;
    const result = sweph.rise_trans(
      jd - timezone / 24,
      SE_MOON,
      "",
      SEFLG_SWIEPH,
      SE_BIT_DISC_CENTER + SE_CALC_RISE,
      [longitude, latitude, 0],
      1013.25,
      15
    );

    if (result.error) {
      return [0, 0, 0]; // Return zeros if moonrise doesn't occur
    }

    const rise = result.data;
    return this.toDms((rise - jd) * 24 + timezone);
  }

  /**
   * Calculate moonset time
   */
  private moonset(jd: number, location: Location): number[] {
    const { latitude, longitude, timezone } = location;
    const result = sweph.rise_trans(
      jd - timezone / 24,
      SE_MOON,
      "",
      SEFLG_SWIEPH,
      SE_BIT_DISC_CENTER + SE_CALC_SET,
      [longitude, latitude, 0],
      1013.25,
      15
    );

    if (result.error) {
      return [0, 0, 0]; // Return zeros if moonset doesn't occur
    }

    const setting = result.data;
    return this.toDms((setting - jd) * 24 + timezone);
  }

  /**
   * Calculate lunar phase (moon's position relative to sun)
   */
  private lunarPhase(jd: number): number {
    const solarLong = this.solarLongitude(jd);
    const lunarLong = this.lunarLongitude(jd);
    return (lunarLong - solarLong + 360) % 360;
  }

  /**
   * Unwrap angles to ensure ascending order
   */
  private unwrapAngles(angles: number[]): number[] {
    const result = [...angles];
    for (let i = 1; i < result.length; i++) {
      if (result[i] < result[i - 1]) {
        result[i] += 360;
      }
    }
    return result;
  }

  /**
   * Inverse Lagrange interpolation
   */
  private inverseLagrange(x: number[], y: number[], ya: number): number {
    let total = 0;
    for (let i = 0; i < x.length; i++) {
      let numer = 1;
      let denom = 1;
      for (let j = 0; j < x.length; j++) {
        if (j !== i) {
          numer *= ya - y[j];
          denom *= y[i] - y[j];
        }
      }
      total += (numer * x[i]) / denom;
    }
    return total;
  }

  /**
   * Calculate Tithi (lunar day)
   */
  calculateTithi(jd: number, location: Location): TithiResult[] {
    const { timezone } = location;

    // Base JD at 0h UT for end-time display conversion
    const jdLocalMidnight = Math.floor(jd - 0.5) + 0.5;

    // 1. Calculate lunar phase at the given moment (sunrise)
    const phaseNow = this.lunarPhase(jd);

    // 2. Determine current tithi using ceil (standard Drik Panchanga formula)
    let currentTithi = Math.ceil(phaseNow / 12);
    if (currentTithi <= 0) currentTithi = 30; // phase exactly 0° → end of Amavasya

    // 3. Degrees left to traverse before this tithi ends
    const degreesLeft = currentTithi * 12 - phaseNow;

    // 4. Compute relative moon-sun motion at intervals after anchor (Lagrange method)
    const offsets = [0.25, 0.5, 0.75, 1.0];
    const lunarLongDiff = offsets.map((t) =>
      (this.lunarLongitude(jd + t) - this.lunarLongitude(jd) + 360) % 360
    );
    const solarLongDiff = offsets.map((t) =>
      (this.solarLongitude(jd + t) - this.solarLongitude(jd) + 360) % 360
    );
    const relativeMotion = offsets.map(
      (_, i) => lunarLongDiff[i] - solarLongDiff[i]
    );

    // 5. Find end time by 4-point inverse Lagrange interpolation
    let approxEnd = this.inverseLagrange(offsets, relativeMotion, degreesLeft);
    if (!isFinite(approxEnd) || approxEnd < 0) approxEnd = 0;

    // Convert to local clock hours
    let endHours = (jd + approxEnd - jdLocalMidnight) * 24 + timezone;
    while (endHours < 0) endHours += 24;

    // Determine paksha
    const paksha = currentTithi <= 15 ? "Shukla" : "Krishna";

    const results: TithiResult[] = [
      {
        number: currentTithi,
        name: this.getTithiName(currentTithi),
        endTime: this.toDms(endHours),
        paksha,
      },
    ];

    // 6. Check for kshaya (skipped) tithi — if next sunrise's tithi
    //    jumps by more than 1, a tithi was entirely contained within today
    const phaseTomorrow = this.lunarPhase(jd + 1);
    let tithiTomorrow = Math.ceil(phaseTomorrow / 12);
    if (tithiTomorrow <= 0) tithiTomorrow = 30;
    const isSkipped = (tithiTomorrow - currentTithi + 30) % 30 > 1;

    if (isSkipped) {
      const leapTithi = (currentTithi % 30) + 1;
      const leapDegreesLeft = leapTithi * 12 - phaseNow;
      let leapApproxEnd = this.inverseLagrange(
        offsets,
        relativeMotion,
        leapDegreesLeft
      );
      if (!isFinite(leapApproxEnd) || leapApproxEnd < 0) leapApproxEnd = 0;
      let leapEndHours =
        (jd + leapApproxEnd - jdLocalMidnight) * 24 + timezone;
      while (leapEndHours < 0) leapEndHours += 24;

      const leapPaksha = leapTithi <= 15 ? "Shukla" : "Krishna";
      results.push({
        number: leapTithi,
        name: this.getTithiName(leapTithi),
        endTime: this.toDms(leapEndHours),
        paksha: leapPaksha,
      });
    }

    return results;
  }


  /**
   * Calculate Nakshatra (lunar mansion)
   */
  calculateNakshatra(jd: number, location: Location): NakshatraResult[] {
    sweph.set_sid_mode(SE_SIDM_LAHIRI, 0, 0);
    const { timezone } = location;
    const jdLocalMidnight = Math.floor(jd - 0.5) + 0.5;

    // Use same ayanamsa for all offsets (reference implementation standard)
    const ayanamsa = sweph.get_ayanamsa_ut(jd);
    const offsets = [0.0, 0.25, 0.5, 0.75, 1.0];
    const longitudes = offsets.map((t) => {
      const lunarLong = this.lunarLongitude(jd + t);
      return (lunarLong - ayanamsa + 360) % 360;
    });

    let current = Math.ceil((longitudes[0] * 27) / 360);
    if (current <= 0) current = 27;

    const targetDeg = current * (360 / 27);
    const y = this.unwrapAngles(longitudes);
    let approx = this.inverseLagrange(offsets, y, targetDeg);
    if (!isFinite(approx) || approx < 0) approx = 0;

    let endHours = (jd + approx - jdLocalMidnight) * 24 + timezone;
    while (endHours < 0) endHours += 24;

    const results: NakshatraResult[] = [
      {
        number: current,
        name: this.getNakshatraName(current),
        endTime: this.toDms(endHours),
      },
    ];

    // Check for skipped nakshatra
    let nakTmrw = Math.ceil((longitudes[longitudes.length - 1] * 27) / 360);
    if (nakTmrw <= 0) nakTmrw = 27;
    const isSkipped = (nakTmrw - current + 27) % 27 > 1;
    if (isSkipped) {
      const leapNak = (current % 27) + 1;
      let leapApprox = this.inverseLagrange(offsets, y, leapNak * (360 / 27));
      if (!isFinite(leapApprox) || leapApprox < 0) leapApprox = 0;
      let leapEndHours = (jd + leapApprox - jdLocalMidnight) * 24 + timezone;
      while (leapEndHours < 0) leapEndHours += 24;
      results.push({
        number: leapNak,
        name: this.getNakshatraName(leapNak),
        endTime: this.toDms(leapEndHours),
      });
    }

    return results;
  }

  /**
   * Calculate Yoga
   */
  calculateYoga(jd: number, location: Location): YogaResult[] {
    sweph.set_sid_mode(SE_SIDM_LAHIRI, 0, 0);
    const { timezone } = location;
    const jdLocalMidnight = Math.floor(jd - 0.5) + 0.5;

    const ayanamsa = sweph.get_ayanamsa_ut(jd);
    const lunarLong = (this.lunarLongitude(jd) - ayanamsa + 360) % 360;
    const solarLong = (this.solarLongitude(jd) - ayanamsa + 360) % 360;
    const total = (lunarLong + solarLong) % 360;

    let current = Math.ceil((total * 27) / 360);
    if (current <= 0) current = 27;

    const degreesLeft = current * (360 / 27) - total;

    // Compute differential longitudinal sums at intervals
    const offsets = [0.25, 0.5, 0.75, 1.0];
    const lunarLongDiff = offsets.map((t) =>
      (this.lunarLongitude(jd + t) - this.lunarLongitude(jd) + 360) % 360
    );
    const solarLongDiff = offsets.map((t) =>
      (this.solarLongitude(jd + t) - this.solarLongitude(jd) + 360) % 360
    );
    const totalMotion = offsets.map(
      (_, i) => lunarLongDiff[i] + solarLongDiff[i]
    );

    let approx = this.inverseLagrange(offsets, totalMotion, degreesLeft);
    if (!isFinite(approx) || approx < 0) approx = 0;

    let endHours = (jd + approx - jdLocalMidnight) * 24 + timezone;
    while (endHours < 0) endHours += 24;

    const results: YogaResult[] = [
      {
        number: current,
        name: this.getYogaName(current),
        endTime: this.toDms(endHours),
      },
    ];

    // Check for skipped yoga
    const lunarLongTmrw =
      (this.lunarLongitude(jd + 1) - ayanamsa + 360) % 360;
    const solarLongTmrw =
      (this.solarLongitude(jd + 1) - ayanamsa + 360) % 360;
    const totalTmrw = (lunarLongTmrw + solarLongTmrw) % 360;
    let yogTmrw = Math.ceil((totalTmrw * 27) / 360);
    if (yogTmrw <= 0) yogTmrw = 27;
    const isSkipped = (yogTmrw - current + 27) % 27 > 1;
    if (isSkipped) {
      const leapYog = (current % 27) + 1;
      const leapDegreesLeft = leapYog * (360 / 27) - total;
      let leapApprox = this.inverseLagrange(
        offsets,
        totalMotion,
        leapDegreesLeft
      );
      if (!isFinite(leapApprox) || leapApprox < 0) leapApprox = 0;
      let leapEndHours =
        (jd + leapApprox - jdLocalMidnight) * 24 + timezone;
      while (leapEndHours < 0) leapEndHours += 24;
      results.push({
        number: leapYog,
        name: this.getYogaName(leapYog),
        endTime: this.toDms(leapEndHours),
      });
    }

    return results;
  }

  /**
   * Calculate Karana (half lunar day)
   */

  calculateKarana(jd: number): KaranaResult {
    const solarLong = this.solarLongitude(jd);
    const lunarLong = this.lunarLongitude(jd);

    const moonPhase = (lunarLong - solarLong + 360) % 360; // 0–360°
    let karanaIndex = Math.ceil(moonPhase / 6); // 1 to 60 in a lunar month
    if (karanaIndex <= 0) karanaIndex = 60;

    return {
      number: karanaIndex,
      name: this.getKaranaName(karanaIndex),
    };
  }

  /**
   * Calculate weekday (Vaara) from Gregorian date
   * 0 = Sunday, 1 = Monday, ... 6 = Saturday
   * Uses Tomohiko Sakamoto's algorithm for reliability.
   */
  private calculateVaaraFromDate(date: PanchangaDate): number {
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = date.year;
    const m = date.month;
    const d = date.day;
    if (m < 3) y -= 1;
    const w =
      (y +
        Math.floor(y / 4) -
        Math.floor(y / 100) +
        Math.floor(y / 400) +
        t[m - 1] +
        d) %
      7;
    return w;
  }

  /**
   * Calculate lunar month (Masa)
   */
  calculateMasa(jd: number, location: Location): MasaResult {
    // Get sunrise JD (not just hour)
    const { latitude, longitude, timezone } = location;
    const result = sweph.rise_trans(
      jd - timezone / 24,
      SE_SUN,
      "",
      SEFLG_SWIEPH,
      SE_BIT_DISC_CENTER + SE_CALC_RISE,
      [longitude, latitude, 0],
      1013.25,
      15
    );

    if (result.error) throw new Error(`Sunrise JD calc error: ${result.error}`);

    const sunriseJd = result.data; // JD of sunrise (UT)

    const ti = this.calculateTithi(sunriseJd, location)[0].number;

    const lastNewMoon = this.newMoon(sunriseJd, ti, -1);
    const nextNewMoon = this.newMoon(sunriseJd, ti, 1);

    const thisSolarMonth = this.raasi(lastNewMoon);
    const nextSolarMonth = this.raasi(nextNewMoon);
    const isLeapMonth = thisSolarMonth === nextSolarMonth;

    let maasa = thisSolarMonth + 1;
    if (maasa > 12) maasa = maasa % 12;

    return {
      number: maasa,
      name: this.getMasaName(maasa),
      isAdhika: isLeapMonth,
    };
  }

  /**
   * Calculate day duration
   */
  calculateDayDuration(jd: number, location: Location): number[] {
    const sriseHrs = this.sunrise(jd, location); // [hh, mm, ss]
    const ssetHrs = this.sunset(jd, location); // [hh, mm, ss]

    // Convert [hh, mm, ss] → total hours
    const srise = sriseHrs[0] + sriseHrs[1] / 60 + sriseHrs[2] / 3600;
    const sset = ssetHrs[0] + ssetHrs[1] / 60 + ssetHrs[2] / 3600;

    const diff = sset - srise;
    return this.toDms(diff);
  }

  /**
   * Find new moon
   */
  private newMoon(jd: number, tithi: number, opt: number): number {
    let start: number;
    if (opt === -1) {
      start = jd - tithi; // previous new moon
    } else if (opt === 1) {
      start = jd + (30 - tithi); // next new moon
    } else {
      start = jd;
    }

    // Search within a span of (start ± 2) days
    const x = Array.from({ length: 17 }, (_, i) => -2 + i / 4);
    const y = x.map((i) => this.lunarPhase(start + i));

    // Use unwrapAngles so the curve ascends through 360° at new moon
    const yUnwrapped = this.unwrapAngles(y);
    const y0Offset = this.inverseLagrange(x, yUnwrapped, 360);

    if (!isFinite(y0Offset)) {
      return start; // fallback
    }

    return start + y0Offset;
  }

  /**
   * Calculate Raasi (zodiac sign)
   */
  private raasi(jd: number): number {
    sweph.set_sid_mode(SE_SIDM_LAHIRI, 0, 0);
    const solarLong = this.solarLongitude(jd);
    const ayanamsa = sweph.get_ayanamsa_ut(jd);
    const solarNirayana = (solarLong - ayanamsa + 360) % 360;
    return Math.ceil(solarNirayana / 30);
  }

  /**
   * Get complete Panchanga for a given date and location
   */
  getPanchanga(date: PanchangaDate, location: Location): PanchangaResult {
    // Base JD for the date at 00:00 local
    const baseDate: PanchangaDate = {
      year: date.year,
      month: date.month,
      day: date.day,
    };
    const jdDate = this.gregorianToJd(baseDate);
    
    // If no specific time provided, use SUNRISE for tithi calculation
    // (Hindu calendar dates change at sunrise, not midnight)
    const hasTime = date.hour !== undefined && date.minute !== undefined;
    let anchorUt: number;
    
    if (hasTime) {
      // User provided specific time - use it as-is
      const jdWithTime = this.gregorianToJd(date);
      anchorUt = jdWithTime - location.timezone / 24;
    } else {
      // No time provided - calculate at SUNRISE (proper Hindu calendar)
      const { latitude, longitude, timezone } = location;
      const result = sweph.rise_trans(
        jdDate - timezone / 24,
        SE_SUN,
        "",
        SEFLG_SWIEPH,
        SE_BIT_DISC_CENTER + SE_CALC_RISE,
        [longitude, latitude, 0],
        1013.25,
        15
      );
      if (result.error) {
        throw new Error(`Sunrise calculation error: ${result.error}`);
      }
      anchorUt = result.data; // Use sunrise JD (UT) for calculations
    }

    const result: PanchangaResult = {
      date,
      location,
      tithi: this.calculateTithi(anchorUt, location),
      nakshatra: this.calculateNakshatra(anchorUt, location),
      yoga: this.calculateYoga(anchorUt, location),
      karana: this.calculateKarana(anchorUt),
      masa: this.calculateMasa(jdDate, location), // Masa traditionally at sunrise
      vaara: this.calculateVaaraFromDate(baseDate),
      sunrise: this.sunrise(jdDate, location),
      sunset: this.sunset(jdDate, location),
      moonrise: this.moonrise(jdDate, location),
      moonset: this.moonset(jdDate, location),
      dayDuration: this.calculateDayDuration(jdDate, location),
    };

    return result;
  }

  /**
   * Find all Gregorian dates within a range where the sunrise Tithi equals targetTithi (1..30)
   * Strategy: iterate day by day, compute sunrise JD and Tithi at sunrise.
   */

  // Helper methods for names
  public getTithiName(number: number): string {
    const names = [
      "",
      "Pratipad",
      "Dwitiya",
      "Tritiya",
      "Chaturthi",
      "Panchami",
      "Shashthi",
      "Saptami",
      "Ashtami",
      "Navami",
      "Dashami",
      "Ekadashi",
      "Dwadashi",
      "Trayodashi",
      "Chaturdashi",
      "Purnima",
      "Pratipad",
      "Dwitiya",
      "Tritiya",
      "Chaturthi",
      "Panchami",
      "Shashthi",
      "Saptami",
      "Ashtami",
      "Navami",
      "Dashami",
      "Ekadashi",
      "Dwadashi",
      "Trayodashi",
      "Chaturdashi",
      "Amavasya",
    ];
    return names[number] || `Tithi ${number}`;
  }

  private getNakshatraName(number: number): string {
    const names = [
      "",
      "Ashwini",
      "Bharani",
      "Krittika",
      "Rohini",
      "Mrigashira",
      "Ardra",
      "Punarvasu",
      "Pushya",
      "Ashlesha",
      "Magha",
      "Purva Phalguni",
      "Uttara Phalguni",
      "Hasta",
      "Chitra",
      "Swati",
      "Vishakha",
      "Anuradha",
      "Jyeshtha",
      "Mula",
      "Purva Ashadha",
      "Uttara Ashadha",
      "Shravana",
      "Dhanishta",
      "Shatabhisha",
      "Purva Bhadrapada",
      "Uttara Bhadrapada",
      "Revati",
    ];
    return names[number] || `Nakshatra ${number}`;
  }

  private getYogaName(number: number): string {
    const names = [
      "",
      "Vishkambha",
      "Priti",
      "Ayushman",
      "Saubhagya",
      "Shobhana",
      "Atiganda",
      "Sukarma",
      "Dhriti",
      "Shula",
      "Ganda",
      "Vriddhi",
      "Dhruva",
      "Vyaghata",
      "Harshana",
      "Vajra",
      "Siddhi",
      "Vyatipata",
      "Variyan",
      "Parigha",
      "Shiva",
      "Siddha",
      "Sadhya",
      "Shubha",
      "Shukla",
      "Brahma",
      "Indra",
      "Vaidhriti",
    ];
    return names[number] || `Yoga ${number}`;
  }

  private getKaranaName(number: number): string {
    const names = [
      "",
      "Bava",
      "Balava",
      "Kaulava",
      "Taitila",
      "Gara",
      "Vanija",
      "Vishti",
      "Shakuni",
      "Chatushpada",
      "Naga",
      "Kimstughna",
    ];

    if (number <= 7) {
      return names[number] || `Karana ${number}`;
    } else if (number >= 57 && number <= 60) {
      return names[number - 48] || `Karana ${number}`;
    } else {
      const cyclic = ((number - 1) % 7) + 1;
      return names[cyclic] || `Karana ${number}`;
    }
  }

  private getMasaName(number: number): string {
    const names = [
      "",
      "Chaitra",
      "Vaisakha",
      "Jyeshtha",
      "Ashadha",
      "Shravana",
      "Bhadrapada",
      "Ashwin",
      "Kartik",
      "Margashirsha",
      "Pausha",
      "Magha",
      "Phalguna",
    ];
    return names[number] || `Masa ${number}`;
  }

  /**
   * Compute tithi at a specific local time on a given date.
   * Used for shraddha (aparahna check at ~12:00–15:00).
   */
  private getTithiAtLocalTime(
    year: number,
    month: number,
    day: number,
    localHour: number,
    localMinute: number,
    location: Location
  ): { number: number; paksha: string } {
    const jdDate = sweph.julday(year, month, day, 0, SE_GREG_CAL);
    const jdAtTime =
      jdDate + (localHour + localMinute / 60 - location.timezone) / 24;
    const phase = this.lunarPhase(jdAtTime);
    let tithi = Math.ceil(phase / 12);
    if (tithi <= 0) tithi = 30;
    const paksha = tithi <= 15 ? "Shukla" : "Krishna";
    return { number: tithi, paksha };
  }

  /**
   * Check if target tithi is present during aparahna period (12 noon – 3 PM).
   * Checks at noon, 1:30 PM, and 3 PM to cover the window.
   */
  private isTithiInAparahna(
    year: number,
    month: number,
    day: number,
    targetTithi: number,
    targetPaksha: string,
    location: Location
  ): boolean {
    const checkTimes = [
      [12, 0],
      [13, 30],
      [15, 0],
    ];
    for (const [h, m] of checkTimes) {
      const t = this.getTithiAtLocalTime(year, month, day, h, m, location);
      if (t.number === targetTithi && t.paksha === targetPaksha) {
        return true;
      }
    }
    return false;
  }

  /**
   * Event-type-aware tithi match check.
   * Birthday/Marriage: tithi at sunrise (default getPanchanga behavior)
   * Shraddha: tithi present during aparahna (12 noon – 3 PM)
   *
   * Rules from traditional panchanga:
   * - Birthday: follow tithi at sunrise; only nija masa (skip adhika)
   * - Shraddha: follow tithi during aparahna; both adhika and nija masa
   * - Marriage: follow tithi at sunrise (same as birthday)
   */
  private checkDateForEvent(
    testDate: PanchangaDate,
    location: Location,
    targetTithi: number,
    targetPaksha: string,
    targetMasa: number,
    eventType?: string
  ): {
    matched: boolean;
    panchanga: PanchangaResult | null;
    isAdhikaMasa: boolean;
  } {
    const panchanga = this.getPanchanga(testDate, location);
    const isAdhikaMasa = panchanga.masa.isAdhika;

    // Check masa match
    const isMasaMatch = panchanga.masa.number === targetMasa;
    if (!isMasaMatch) {
      return { matched: false, panchanga, isAdhikaMasa };
    }

    // Birthday/Marriage: skip adhika masa (celebrate only in nija masa)
    if (
      (eventType === "birthday" || eventType === "marriage") &&
      isAdhikaMasa
    ) {
      return { matched: false, panchanga, isAdhikaMasa };
    }

    // Check tithi based on event type
    let isTithiMatch: boolean;
    if (eventType === "shraddha") {
      // Shraddha: tithi must be present during aparahna (12 noon – 3 PM)
      isTithiMatch = this.isTithiInAparahna(
        testDate.year,
        testDate.month,
        testDate.day,
        targetTithi,
        targetPaksha,
        location
      );
    } else {
      // Birthday/Marriage/default: tithi at sunrise
      isTithiMatch = panchanga.tithi.some(
        (t) => t.number === targetTithi && t.paksha === targetPaksha
      );
    }

    return { matched: isTithiMatch && isMasaMatch, panchanga, isAdhikaMasa };
  }

  public findMatchingDates(
    baseDate: PanchangaDate,
    location: Location,
    range: number,
    eventType?: string
  ): MatchingDate[] {
    const matches: MatchingDate[] = [];

    // For shraddha base date, also check aparahna tithi
    const basePanchanga = this.getPanchanga(baseDate, location);

    let baseTithi: number;
    let basePaksha: string;
    if (eventType === "shraddha") {
      // For shraddha, determine the base tithi at aparahna of the input date
      const aparahnaTithi = this.getTithiAtLocalTime(
        baseDate.year,
        baseDate.month,
        baseDate.day,
        13,
        30,
        location
      );
      baseTithi = aparahnaTithi.number;
      basePaksha = aparahnaTithi.paksha;
    } else {
      baseTithi = basePanchanga.tithi[0].number;
      basePaksha = basePanchanga.tithi[0].paksha;
    }
    const baseMasa = basePanchanga.masa.number;

    // Use current year as base for range calculation, not the user's selected date
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - range;
    const endYear = currentYear + range;

    for (let year = startYear; year <= endYear; year++) {
      let foundInYear = false;

      // For shraddha, we may find two dates per year (adhika + nija),
      // so we track count separately
      let matchCountInYear = 0;

      // ✅ Focused search window: ±2 months around base month
      const searchStartMonth = Math.max(1, baseDate.month - 2);
      const searchEndMonth = Math.min(12, baseDate.month + 2);

      for (let month = searchStartMonth; month <= searchEndMonth; month++) {
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          try {
            const testDate: PanchangaDate = {
              year,
              month,
              day,
              calendar: baseDate.calendar || "gregorian",
            };

            const result = this.checkDateForEvent(
              testDate,
              location,
              baseTithi,
              basePaksha,
              baseMasa,
              eventType
            );

            if (result.matched && result.panchanga) {
              matches.push({
                date: testDate,
                fields: {
                  tithi: baseTithi,
                  paksha: basePaksha,
                  nakshatra: result.panchanga.nakshatra[0].number,
                  yoga: result.panchanga.yoga[0].number,
                  karana: result.panchanga.karana.number,
                  masa: baseMasa,
                  vaara: result.panchanga.vaara,
                },
              });

              matchCountInYear++;
              // For shraddha with adhika masa, allow finding both adhika+nija
              if (eventType === "shraddha") {
                if (matchCountInYear >= 2) {
                  foundInYear = true;
                  break;
                }
                // Don't break after first match — keep looking for nija/adhika
              } else {
                foundInYear = true;
                break; // ✅ stop days for birthday/marriage
              }
            }
          } catch {
            continue;
          }
        }

        if (foundInYear) break; // ✅ stop months
      }

      // 🔹 Full year search (only if not found in optimized ±2 month window)
      if (!foundInYear) {
        // Search entire year if not found in optimized window
        for (let month = 1; month <= 12 && !foundInYear; month++) {
          // Skip months already searched in the optimized window
          if (month >= searchStartMonth && month <= searchEndMonth) {
            continue;
          }

          const daysInMonth = new Date(year, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year,
                month,
                day,
                calendar: baseDate.calendar || "gregorian",
              };

              const result = this.checkDateForEvent(
                testDate, location, baseTithi, basePaksha, baseMasa, eventType
              );

              if (result.matched && result.panchanga) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: baseTithi,
                    paksha: basePaksha,
                    nakshatra: result.panchanga.nakshatra[0].number,
                    yoga: result.panchanga.yoga[0].number,
                    karana: result.panchanga.karana.number,
                    masa: baseMasa,
                    vaara: result.panchanga.vaara,
                  },
                });

                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 🔹 Adjacent year search (only if still not found after full year search)
      if (!foundInYear) {
        // November–December of previous year
        for (let month = 11; month <= 12 && !foundInYear; month++) {
          const prevYear = year - 1;
          const daysInMonth = new Date(prevYear, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year: prevYear,
                month,
                day,
                calendar: baseDate.calendar || "gregorian",
              };

              const result = this.checkDateForEvent(
                testDate, location, baseTithi, basePaksha, baseMasa, eventType
              );

              if (result.matched && result.panchanga) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: baseTithi,
                    paksha: basePaksha,
                    nakshatra: result.panchanga.nakshatra[0].number,
                    yoga: result.panchanga.yoga[0].number,
                    karana: result.panchanga.karana.number,
                    masa: baseMasa,
                    vaara: result.panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }

        // January–February of next year
        for (let month = 1; month <= 2 && !foundInYear; month++) {
          const nextYear = year + 1;
          const daysInMonth = new Date(nextYear, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year: nextYear,
                month,
                day,
                calendar: baseDate.calendar || "gregorian",
              };

              const result = this.checkDateForEvent(
                testDate, location, baseTithi, basePaksha, baseMasa, eventType
              );

              if (result.matched && result.panchanga) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: baseTithi,
                    paksha: basePaksha,
                    nakshatra: result.panchanga.nakshatra[0].number,
                    yoga: result.panchanga.yoga[0].number,
                    karana: result.panchanga.karana.number,
                    masa: baseMasa,
                    vaara: result.panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 🔹 FALLBACK: If still not found, find nearest date with relaxed criteria
      if (!foundInYear) {
        // Fallback 1: Same tithi + paksha, ANY masa (masa shift due to Adhika Masa or calendar variations)
        for (let month = 1; month <= 12 && !foundInYear; month++) {
          const daysInMonth = new Date(year, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year,
                month,
                day,
                calendar: baseDate.calendar || "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);

              const isTithiMatch = panchanga.tithi.some(
                (t) => t.number === baseTithi && t.paksha === basePaksha
              );

              // Match tithi+paksha even if masa is different
              if (isTithiMatch) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: baseTithi,
                    paksha: basePaksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: panchanga.masa.number, // Actual masa (may differ from expected)
                    vaara: panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 🔹 FALLBACK 2: If STILL not found, find nearest tithi (any paksha, any masa)
      if (!foundInYear) {
        let nearestDate: MatchingDate | null = null;
        let smallestTithiDiff = Infinity;

        for (let month = 1; month <= 12; month++) {
          const daysInMonth = new Date(year, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year,
                month,
                day,
                calendar: baseDate.calendar || "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);
              const currentTithi = panchanga.tithi[0].number;

              // Calculate tithi difference (circular distance, considering 1-30 wraparound)
              let diff = Math.abs(currentTithi - baseTithi);
              if (diff > 15) diff = 30 - diff; // Handle wraparound (e.g., 30 vs 1)

              // Prefer same paksha, but allow any if needed
              const samePaksha = panchanga.tithi[0].paksha === basePaksha;
              const effectiveDiff = samePaksha ? diff : diff + 0.5; // Slight penalty for different paksha

              if (effectiveDiff < smallestTithiDiff) {
                smallestTithiDiff = effectiveDiff;
                nearestDate = {
                  date: testDate,
                  fields: {
                    tithi: panchanga.tithi[0].number,
                    paksha: panchanga.tithi[0].paksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: panchanga.masa.number,
                    vaara: panchanga.vaara,
                  },
                };
              }
            } catch {
              continue;
            }
          }
        }

        // Add nearest date if found
        if (nearestDate) {
          matches.push(nearestDate);
          foundInYear = true;
        }
      }

      if (!foundInYear) {
        console.warn(`No matching date found for year ${year}`);
      }
    }

    // ✅ Sort final results
    matches.sort((a, b) => {
      const dateA = new Date(a.date.year, a.date.month - 1, a.date.day);
      const dateB = new Date(b.date.year, b.date.month - 1, b.date.day);
      return dateA.getTime() - dateB.getTime();
    });

    return matches;
  }

  /**
   * Find dates matching specific tithi, paksha, and masa values
   * Used by scheduler for generating event occurrences
   * 
   * @param tithi - Tithi number (1-30)
   * @param paksha - Paksha (Krishna or Shukla)
   * @param masa - Masa number (1-12)
   * @param location - Geographic location
   * @param targetYears - Array of years to search
   * @param baseMonth - Optional hint for which month to search around (default: masa value)
   * @returns Array of matching dates
   */
  public findDatesByLunarValues(
    tithi: number,
    paksha: string,
    masa: number,
    location: Location,
    targetYears: number[],
    baseMonth: number = null
  ): MatchingDate[] {
    const matches: MatchingDate[] = [];
    const searchMonth = baseMonth || masa;

    for (const year of targetYears) {
      let foundInYear = false;

      // ✅ Focused search window: ±2 months around base month
      const searchStartMonth = Math.max(1, searchMonth - 2);
      const searchEndMonth = Math.min(12, searchMonth + 2);

      for (let month = searchStartMonth; month <= searchEndMonth && !foundInYear; month++) {
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          try {
            const testDate: PanchangaDate = {
              year,
              month,
              day,
              calendar: "gregorian",
            };

            const panchanga = this.getPanchanga(testDate, location);

            const isTithiMatch = panchanga.tithi.some(
              (t) => t.number === tithi && t.paksha === paksha
            );

            const isMasaMatch = panchanga.masa.number === masa;

            if (isTithiMatch && isMasaMatch) {
              matches.push({
                date: testDate,
                fields: {
                  tithi: tithi,
                  paksha: paksha,
                  nakshatra: panchanga.nakshatra[0].number,
                  yoga: panchanga.yoga[0].number,
                  karana: panchanga.karana.number,
                  masa: masa,
                  vaara: panchanga.vaara,
                },
              });

              foundInYear = true;
              break; // ✅ stop days
            }
          } catch {
            continue;
          }
        }
      }

      // 🔹 Full year search (only if not found in optimized ±2 month window)
      if (!foundInYear) {
        // Search entire year if not found in optimized window
        for (let month = 1; month <= 12 && !foundInYear; month++) {
          // Skip months already searched in the optimized window
          if (month >= searchStartMonth && month <= searchEndMonth) {
            continue;
          }

          const daysInMonth = new Date(year, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year,
                month,
                day,
                calendar: "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);

              const isTithiMatch = panchanga.tithi.some(
                (t) => t.number === tithi && t.paksha === paksha
              );
              const isMasaMatch = panchanga.masa.number === masa;

              if (isTithiMatch && isMasaMatch) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: tithi,
                    paksha: paksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: masa,
                    vaara: panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 🔹 Adjacent year search (only if still not found after full year search)
      if (!foundInYear) {
        // November–December of previous year
        for (let month = 11; month <= 12 && !foundInYear; month++) {
          const prevYear = year - 1;
          const daysInMonth = new Date(prevYear, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year: prevYear,
                month,
                day,
                calendar: "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);

              const isTithiMatch = panchanga.tithi.some(
                (t) => t.number === tithi && t.paksha === paksha
              );
              const isMasaMatch = panchanga.masa.number === masa;

              if (isTithiMatch && isMasaMatch) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: tithi,
                    paksha: paksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: masa,
                    vaara: panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }

        // January–February of next year
        for (let month = 1; month <= 2 && !foundInYear; month++) {
          const nextYear = year + 1;
          const daysInMonth = new Date(nextYear, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year: nextYear,
                month,
                day,
                calendar: "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);

              const isTithiMatch = panchanga.tithi.some(
                (t) => t.number === tithi && t.paksha === paksha
              );
              const isMasaMatch = panchanga.masa.number === masa;

              if (isTithiMatch && isMasaMatch) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: tithi,
                    paksha: paksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: masa,
                    vaara: panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 🔹 FALLBACK: If still not found, find nearest date with relaxed criteria
      if (!foundInYear) {
        // Fallback 1: Same tithi + paksha, ANY masa (masa shift due to Adhika Masa or calendar variations)
        for (let month = 1; month <= 12 && !foundInYear; month++) {
          const daysInMonth = new Date(year, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year,
                month,
                day,
                calendar: "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);

              const isTithiMatch = panchanga.tithi.some(
                (t) => t.number === tithi && t.paksha === paksha
              );

              // Match tithi+paksha even if masa is different
              if (isTithiMatch) {
                matches.push({
                  date: testDate,
                  fields: {
                    tithi: tithi,
                    paksha: paksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: panchanga.masa.number, // Actual masa (may differ from expected)
                    vaara: panchanga.vaara,
                  },
                });
                foundInYear = true;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }

      // 🔹 FALLBACK 2: If STILL not found, find nearest tithi (any paksha, any masa)
      if (!foundInYear) {
        let nearestDate: MatchingDate | null = null;
        let smallestTithiDiff = Infinity;

        for (let month = 1; month <= 12; month++) {
          const daysInMonth = new Date(year, month, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            try {
              const testDate: PanchangaDate = {
                year,
                month,
                day,
                calendar: "gregorian",
              };

              const panchanga = this.getPanchanga(testDate, location);
              const currentTithi = panchanga.tithi[0].number;

              // Calculate tithi difference (circular distance, considering 1-30 wraparound)
              let diff = Math.abs(currentTithi - tithi);
              if (diff > 15) diff = 30 - diff; // Handle wraparound (e.g., 30 vs 1)

              // Prefer same paksha, but allow any if needed
              const samePaksha = panchanga.tithi[0].paksha === paksha;
              const effectiveDiff = samePaksha ? diff : diff + 0.5; // Slight penalty for different paksha

              if (effectiveDiff < smallestTithiDiff) {
                smallestTithiDiff = effectiveDiff;
                nearestDate = {
                  date: testDate,
                  fields: {
                    tithi: panchanga.tithi[0].number,
                    paksha: panchanga.tithi[0].paksha,
                    nakshatra: panchanga.nakshatra[0].number,
                    yoga: panchanga.yoga[0].number,
                    karana: panchanga.karana.number,
                    masa: panchanga.masa.number,
                    vaara: panchanga.vaara,
                  },
                };
              }
            } catch {
              continue;
            }
          }
        }

        // Add nearest date if found
        if (nearestDate) {
          matches.push(nearestDate);
          foundInYear = true;
        }
      }
    }

    // ✅ Sort final results
    matches.sort((a, b) => {
      const dateA = new Date(a.date.year, a.date.month - 1, a.date.day);
      const dateB = new Date(b.date.year, b.date.month - 1, b.date.day);
      return dateA.getTime() - dateB.getTime();
    });

    return matches;
  }
}
