export function DataTable({
  label,
  headers,
  rows,
}: {
  label: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="chart-data">
      <summary>{label}</summary>
      <div className="chart-table-scroll">
        <table>
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {headers.map((header) => (
                <th scope="col" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th scope="row" key={j}>
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
