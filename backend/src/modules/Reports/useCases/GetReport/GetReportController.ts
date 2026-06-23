import { Request, Response } from 'express';
import { container } from 'tsyringe';

import { GetReportUseCase, ReportType } from './GetReportUseCase';

export class GetReportController {
  async handle(type: ReportType, request: Request, response: Response): Promise<Response> {
    const useCase = container.resolve(GetReportUseCase);
    const from = new Date(String(request.query.from));
    const to = new Date(String(request.query.to));
    const result = await useCase.execute({
      companyId: request.companyId!,
      type,
      from,
      to,
    });

    if (request.query.format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${type}-${from.toISOString().slice(0, 10)}-${to
          .toISOString()
          .slice(0, 10)}.csv"`,
      );
      return response.send(toCsv(result.rows));
    }

    return response.json({ data: result });
  }
}

function toCsv(rows: Array<Record<string, string | number | null>>): string {
  if (rows.length === 0) return '';
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    headers.join(';'),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(';')),
  ];
  return `${lines.join('\n')}\n`;
}

function csvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/"/g, '""');
  return /[;\n"]/.test(text) ? `"${text}"` : text;
}
