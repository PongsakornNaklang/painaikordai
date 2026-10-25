# Thailand Transportation Network Data: Multi-Modal Origin-Destination Matrices Across Spatial Scales

Companion repository for the Data in Brief article
**"Thailand Transportation Network Data: Multi-Modal Origin-Destination Matrices Across Spatial Scales"**
(Lefebvre, Sobti & Manoharan, 2026).

This deposit contains the analysis-ready products only: long-form trip tables and
origin-destination matrices, plus one terminal reference table. Raw scrape files
and intermediate joined files are not included; the external sources they derive
from are linked below.

## Contents

```
Trip tables (one row per origin-destination terminal pair, with traffic volume):
  bus_ferry_traffic.csv                       7,949 rows × 44 cols - combined bus + ferry
  bus_traffic.csv                             7,782 rows × 44 cols - bus only
  ferry_traffic.csv                             167 rows × 44 cols - ferry only
  train_traffic.csv                             374 rows × 44 cols - train only
  flight_traffic.csv                            343 rows × 41 cols - domestic aviation only
OD matrices (square origin-destination matrices, 20 files):
  od_{terminal,province,district,subdistrict}_{bus,ferry,train,flight,bus_ferry}.csv
                                                4 nested resolutions × 5 mode groupings
Reference and documentation:
  terminal_reference.csv                      584 rows - every terminal/station/port/airport with
                                                coordinates and ADM1–ADM3 PCODEs (the key that
                                                resolves terminal-resolution OD matrix labels)
  data_dictionary.md                          Column-by-column documentation
```

The `bus_ferry` file combines the bus and ferry networks; the per-mode files are
equivalent single-mode products. Aviation volumes are annual (2023) while ground
services are reported daily (2024), so the two should not be summed without the
normalisation described in the article.

## External resources 

The dataset draws on four publicly available sources:

- **BusOnlineTicket.co.th** route catalogue and per-route pages, accessed August
  to October 2024 at <https://www.busonlineticket.co.th/>. Primary source for bus,
  train, and ferry route alignments, operators, frequencies, prices, and distances.

- **Airports of Thailand (AOT) 2023 Airport Traffic Report**, obtained as a PDF from
  <https://www.airportthai.co.th/>. Source for routes touching one of the six
  AOT-operated airports.

- **Department of Airports (DOA) 2023 Air Transport Statistics**, obtained as an Excel
  workbook from <https://www.airports.go.th/>. Source for routes anchored to the 27
  DOA-operated regional airports. The flight-level workbook (128,024 records) is not
  redistributed; the aggregated per-OD result is what enters `flight_traffic.csv`.

- **Royal Thai Survey Department subnational administrative boundaries** (ADM1–ADM3),
  21 January 2022 release, distributed through the Humanitarian Data Exchange at
  <https://data.humdata.org/dataset/cod-ab-tha>. Used for the point-in-polygon spatial
  join that attaches sub-district, district, and province PCODEs to every terminal, and
  that labels the rows and columns of the aggregated OD matrices.

## Notes on the OD matrices

For each of the four resolutions there are five matrices: one per mode (`bus`,
`train`, `ferry`, `flight`) and one for the combined bus-plus-ferry network (`bus_ferry`).
Cells are weighted by daily trip counts for the ground modes and by annual passenger
volume for aviation. Terminal-resolution matrices are labelled by terminal name; join
`terminal_reference.csv` on `(mode, location)` to recover coordinates and PCODEs.
Province, district, and sub-district matrices are labelled by RTSD PCODE (`TH##`,
`TH####`, and `TH######` respectively), not by English name, so that distinct
administrative units that share a romanised name stay separate.

## Citation

Lefebvre, B., Sobti, K., Manoharan, M. (2026). Thailand Transportation Network Data:
Multi-Modal Origin-Destination Matrices Across Spatial Scales.
Data in Brief, in submission. Zenodo: <https://doi.org/10.5281/zenodo.22045851>.
