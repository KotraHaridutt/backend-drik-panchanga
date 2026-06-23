import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  Logger,
} from "@nestjs/common";
import { ApiTags, ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { PanchangaService } from "./panchanga.service";
import type {
  PanchangaDate,
  Location,
  PanchangaResult,
  TithiDatesResponse,
} from "./interfaces/panchanga.interface";

export class GetPanchangaDto {
  @ApiProperty({ description: 'Year (e.g., 2024)' })
  @Type(() => Number)
  @IsNumber()
  year: number;

  @ApiProperty({ description: 'Month (1-12)' })
  @Type(() => Number)
  @IsNumber()
  month: number;

  @ApiProperty({ description: 'Day of the month (1-31)' })
  @Type(() => Number)
  @IsNumber()
  day: number;

  @ApiPropertyOptional({ description: 'Hour of the day (0-23)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  hour?: number;

  @ApiPropertyOptional({ description: 'Minute of the hour (0-59)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  minute?: number;

  @ApiPropertyOptional({ description: 'Latitude of the location' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude of the location' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Timezone offset (e.g., 5.5 for IST)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  timezone?: number;

  @ApiPropertyOptional({ description: 'Calendar type' })
  @IsString()
  @IsOptional()
  calendar?: string;
}

export class GetTithiDatesDto {
  @ApiProperty({ description: 'Tithi number (1-30)' })
  @Type(() => Number)
  @IsNumber()
  tithi: number; // 1..30

  @ApiProperty({ description: 'Latitude of the location' })
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Longitude of the location' })
  @Type(() => Number)
  @IsNumber()
  longitude: number;

  @ApiProperty({ description: 'Timezone offset (e.g., 5.5 for IST)' })
  @Type(() => Number)
  @IsNumber()
  timezone: number;

  @ApiPropertyOptional({ description: 'Calendar type for interpreting start/end boundaries' })
  @IsString()
  @IsOptional()
  calendar?: string; // for interpreting start/end boundaries

  // Optional explicit range; defaults to last 5 and next 10 years from today
  @ApiPropertyOptional({ description: 'Start year for the range' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  startYear?: number;

  @ApiPropertyOptional({ description: 'End year for the range' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  endYear?: number;
}

@ApiTags("Panchanga")
@Controller("panchanga")
export class PanchangaController {
  private readonly logger = new Logger(PanchangaController.name);

  constructor(private readonly panchangaService: PanchangaService) {}

  /**
   * Get location with default values if not provided
   */
  private getLocation(query: Partial<GetPanchangaDto>): Location {
    return {
      latitude: query.latitude ?? 17.385,
      longitude: query.longitude ?? 78.4867,
      timezone: query.timezone ?? 5.5,
    };
  }

  @Get()
  getPanchanga(@Query() query: GetPanchangaDto): PanchangaResult {
    const date: PanchangaDate = {
      year: query.year,
      month: query.month,
      day: query.day,
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);

    return this.panchangaService.getPanchanga(date, location);
  }

  @Post()
  getPanchangaPost(@Body() body: GetPanchangaDto): PanchangaResult {
    const date: PanchangaDate = {
      year: body.year,
      month: body.month,
      day: body.day,
      hour: body.hour,
      minute: body.minute,
      calendar: body.calendar,
    };

    const location = this.getLocation(body);

    return this.panchangaService.getPanchanga(date, location);
  }

  @Get("tithi")
  getTithi(@Query() query: GetPanchangaDto) {
    const date: PanchangaDate = {
      year: query.year,
      month: query.month,
      day: query.day,
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);

    const jd = this.panchangaService["gregorianToJd"](date);
    return this.panchangaService.calculateTithi(jd, location);
  }

  @Get("nakshatra")
  getNakshatra(@Query() query: GetPanchangaDto) {
    const date: PanchangaDate = {
      year: query.year,
      month: query.month,
      day: query.day,
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);

    const jd = this.panchangaService["gregorianToJd"](date);
    return this.panchangaService.calculateNakshatra(jd, location);
  }

  @Get("yoga")
  getYoga(@Query() query: GetPanchangaDto) {
    const date: PanchangaDate = {
      year: query.year,
      month: query.month,
      day: query.day,
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);

    const jd = this.panchangaService["gregorianToJd"](date);
    return this.panchangaService.calculateYoga(jd, location);
  }

  @Get("health")
  getHealth() {
    return { status: "OK", service: "Drik Panchanga NestJS" };
  }

  @Get("today")
  getToday(@Query() query: Partial<GetPanchangaDto>) {
    const today = new Date();
    const date: PanchangaDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);
    const panchanga = this.panchangaService.getPanchanga(date, location);

    // Get day of week name
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayName = dayNames[panchanga.vaara];

    // Get month name
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const monthName = monthNames[date.month - 1];

    // Format masa name with suffix
    const masaName = `${panchanga.masa.name} Masam`;

    return {
      weekday: dayName,
      date: `${dayName}, ${monthName} ${date.day}, ${date.year}`,
      tithi: panchanga.tithi[0].name,
      masa: masaName,
      formatted: `${dayName}, ${monthName} ${date.day}, ${date.year}\n${panchanga.tithi[0].name}, ${masaName}`,
      details: {
        gregorianDate: date,
        location,
        tithi: {
          number: panchanga.tithi[0].number,
          name: panchanga.tithi[0].name,
          paksha: panchanga.tithi[0].paksha,
        },
        nakshatra: {
          number: panchanga.nakshatra[0].number,
          name: panchanga.nakshatra[0].name,
        },
        yoga: {
          number: panchanga.yoga[0].number,
          name: panchanga.yoga[0].name,
        },
        masa: panchanga.masa,
        vaara: dayName,
      },
    };
  }

  @Get("tithi-dates")
  async getTithiDates(
    @Query() query: GetTithiDatesDto
  ): Promise<TithiDatesResponse> {
    const tithi = query.tithi;
    const location: Location = {
      latitude: query.latitude,
      longitude: query.longitude,
      timezone: query.timezone,
    };

    const today = new Date();
    const startYear = query.startYear
      ? Number(query.startYear)
      : today.getFullYear() - 5;
    const endYear = query.endYear
      ? Number(query.endYear)
      : today.getFullYear() + 10;

    // ...existing code...
    const startDate: PanchangaDate = {
      year: startYear,
      month: 1,
      day: 1,
      calendar: query.calendar || "gregorian",
    };

    // Calculate range as the number of years between startYear and endYear
    const range = endYear - startYear + 1;

    // Get matches and transform them to expected response format
    const matches = this.panchangaService.findMatchingDates(
      startDate,
      location,
      range
    );
    // ...existing code...
    return {
      tithiNumber: tithi,
      tithiName: this.panchangaService["getTithiName"](tithi),
      location,
      range: {
        start: { year: startYear, month: 1, day: 1 },
        end: { year: endYear, month: 12, day: 31 },
      },
      dates: matches.map((m) => ({
        year: m.date.year,
        month: m.date.month,
        day: m.date.day,
      })),
      count: matches.length,
    };
  }

  @Post("matching-dates")
  async getMatchingDatesFromPayload(
    @Body()
    body: {
      year: number;
      month: number;
      day: number;
      latitude: number;
      longitude: number;
      timezone: number;
      range?: number;
      calendar?: string;
      eventType?: string; // 'birthday' | 'shraddha' | 'marriage'
    }
  ): Promise<PanchangaResult[]> {
    try {
      const baseYear = parseInt(body.year.toString());
      const range = body.range !== undefined ? Math.abs(Number(body.range)) : 1;

      const location: Location = {
        latitude: parseFloat(body.latitude.toString()),
        longitude: parseFloat(body.longitude.toString()),
        timezone: parseFloat(body.timezone.toString()),
      };

      if (
        isNaN(baseYear) ||
        isNaN(Number(body.month)) ||
        isNaN(Number(body.day)) ||
        isNaN(location.latitude) ||
        isNaN(location.longitude) ||
        isNaN(location.timezone)
      ) {
        throw new Error("Invalid input parameters");
      }

      const date: PanchangaDate = {
        year: baseYear,
        month: parseInt(body.month.toString()),
        day: parseInt(body.day.toString()),
        calendar: body.calendar || "gregorian",
      };

      // Pass range and eventType to service
      const matches = this.panchangaService.findMatchingDates(
        date,
        location,
        range,
        body.eventType
      );

      return matches.map((match) =>
        this.panchangaService.getPanchanga(match.date, location)
      );
    } catch (error) {
      this.logger.error("Error finding matching dates:", error);
      throw new Error(`Failed to find matching dates: ${error.message}`);
    }
  }

  @Get("birth-date")
  getBirthDatePanchanga(@Query() query: GetPanchangaDto) {
    this.logger.log(`Birth date request: year=${query.year}, month=${query.month}, day=${query.day}`);

    // Query params are already transformed to numbers by class-transformer
    const date: PanchangaDate = {
      year: query.year,
      month: query.month,
      day: query.day,
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);

    const panchanga = this.panchangaService.getPanchanga(date, location);
    const currentYear = new Date().getFullYear();

    // Find matching dates using 'birthday' rule:
    // tithi at sunrise, nija masa only (skip adhika)
    const matches = this.panchangaService.findMatchingDates(
      date,
      location,
      1, // range of 1 year
      "birthday"
    );

    // Filter for current year
    const thisYearMatch = matches.find((m) => m.date.year === currentYear);

    return {
      birthDate: {
        year: date.year,
        month: date.month,
        day: date.day,
      },
      tithi: {
        number: panchanga.tithi[0].number,
        name: panchanga.tithi[0].name,
        paksha: panchanga.tithi[0].paksha,
      },
      nakshatra: {
        number: panchanga.nakshatra[0].number,
        name: panchanga.nakshatra[0].name,
      },
      masa: {
        number: panchanga.masa.number,
        name: panchanga.masa.name,
        isAdhika: panchanga.masa.isAdhika,
      },
      thisYearDate: thisYearMatch
        ? {
            year: thisYearMatch.date.year,
            month: thisYearMatch.date.month,
            day: thisYearMatch.date.day,
          }
        : null,
      eventType: "birthday",
      rules: "Tithi at sunrise; nija masa only (adhika masa skipped)",
    };
  }

  /**
   * Shraddha date endpoint.
   * Rule: tithi during aparahna (12 noon–3 PM); both adhika & nija masa.
   */
  @Get("shraddha-date")
  getShraddhaDatePanchanga(@Query() query: GetPanchangaDto) {
    this.logger.log(`Shraddha date request: year=${query.year}, month=${query.month}, day=${query.day}`);

    const date: PanchangaDate = {
      year: query.year,
      month: query.month,
      day: query.day,
      hour: query.hour,
      minute: query.minute,
      calendar: query.calendar,
    };

    const location = this.getLocation(query);
    
    
    // Force evaluation of the input date to happen during the afternoon (Aparahna) window
    const baseAparahnaDate: PanchangaDate = {
      ...date,
      hour: 13,
      minute: 30
    };
    
    // Fetch the panchanga data using the afternoon time so it grabs the correct Shraddha Tithi!
    const panchanga = this.panchangaService.getPanchanga(baseAparahnaDate, location);
    

    const currentYear = new Date().getFullYear();

    // Find matching dates using 'shraddha' rule:
    // tithi during aparahna (12-3 PM), both adhika + nija masa
    const matches = this.panchangaService.findMatchingDates(
      baseAparahnaDate, // Pass the afternoon date here as well to keep base Tithi tracking aligned
      location,
      1,
      "shraddha"
    );

    const thisYearMatches = matches.filter((m) => m.date.year === currentYear);

    return {
      shraddhaDate: {
        year: date.year,
        month: date.month,
        day: date.day,
      },
      tithi: {
        number: panchanga.tithi[0].number,
        name: panchanga.tithi[0].name,
        paksha: panchanga.tithi[0].paksha,
      },
      masa: {
        number: panchanga.masa.number,
        name: panchanga.masa.name,
        isAdhika: panchanga.masa.isAdhika,
      },
      thisYearDates: thisYearMatches.map((m) => ({
        year: m.date.year,
        month: m.date.month,
        day: m.date.day,
      })),
      allMatches: matches.map((m) => ({
        year: m.date.year,
        month: m.date.month,
        day: m.date.day,
      })),
      eventType: "shraddha",
      rules: "Tithi during aparahna (12 noon–3 PM); both adhika & nija masa",
    };
  }

  /**
   * Validation endpoint — tests the error cases from the spreadsheet.
   * Hit GET /panchanga/validate to see if fixes are working.
   */
  @Get("validate")
  validatePanchangaFixes() {
    const hyderabad: Location = { latitude: 17.385, longitude: 78.4867, timezone: 5.5 };

    const testCases = [
      { date: { year: 2026, month: 3, day: 7 },   expected: { masa: "Phalguna", tithi: "Panchami" },         label: "Error 1" },
      { date: { year: 2022, month: 12, day: 5 },   expected: { masa: "Margashirsha", tithi: "Trayodashi" },   label: "Error 2" },
      { date: { year: 2023, month: 10, day: 10 },  expected: { masa: "Bhadrapada", tithi: "Dwadashi" },      label: "Error 3" },
      { date: { year: 2024, month: 9, day: 16 },   expected: { masa: "Bhadrapada", tithi: "Chaturdashi" },   label: "Error 4" },
      { date: { year: 2021, month: 5, day: 20 },   expected: { masa: "Vaisakha", tithi: "Navami" },          label: "Error 5" },
    ];

    const results = testCases.map((tc) => {
      try {
        const p = this.panchangaService.getPanchanga(tc.date as PanchangaDate, hyderabad);
        const gotTithi = p.tithi[0].name;
        const gotMasa = p.masa.name;
        const tithiOk = gotTithi === tc.expected.tithi;
        const masaOk = gotMasa === tc.expected.masa;
        return {
          label: tc.label,
          inputDate: `${tc.date.day}/${tc.date.month}/${tc.date.year}`,
          expected: `${tc.expected.masa} ${tc.expected.tithi}`,
          got: `${gotMasa} ${p.tithi[0].paksha} ${gotTithi}`,
          tithiPass: tithiOk ? "✅" : "❌",
          masaPass: masaOk ? "✅" : "❌",
          overall: tithiOk && masaOk ? "✅ PASS" : "❌ FAIL",
        };
      } catch (err) {
        return { label: tc.label, overall: "❌ ERROR", error: err.message };
      }
    });

    return {
      summary: `${results.filter((r) => r.overall?.includes("PASS")).length}/${results.length} passed`,
      results,
      rulesImplemented: [
        "Birthday: tithi at sunrise, nija masa only",
        "Shraddha: tithi during aparahna (12-3 PM), both adhika & nija masa",
        "Marriage: same as birthday",
      ],
    };
  }
}
