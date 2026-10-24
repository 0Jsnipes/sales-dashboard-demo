# Performance Pivot Template

The performance export now runs from `GET /api/performance/export`.

That route is the correct place to support a real Excel PivotTable template later. Right now it generates the workbook server-side and includes the raw source tabs a template would need:

- `All Sales`
- `Company A Sales`
- `Company B Sales`
- `Past Due`
- `Canceled`

## How to wire a real Excel template

1. Create a workbook in desktop Excel.
2. Build PivotTables and charts from `All Sales` or provider-specific tabs.
3. Save the template workbook into the repo at a dedicated path, for example:
   - `private/templates/performance-pivot-template.xlsx`
4. Update `app/api/performance/export/route.ts` to load that file and replace only the raw data tabs.

## Important limitation

The `xlsx` package can write sheet data, but it does not author native PivotTable definitions. That is why the route is server-side now, but a real Excel-authored template is still required for native pivots/charts.
