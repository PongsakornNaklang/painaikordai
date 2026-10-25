# Data Dictionary

## `trip_tables/{mode}_traffic.csv`

One row per origin-destination terminal pair, carrying the route's traffic volume.
The four ground/aviation files and the combined `bus_ferry` file share the same
layout, with two differences: the ground files (`bus`, `ferry`, `train`, `bus_ferry`)
carry service/price columns and `Total Trips`; the flight file carries aviation-volume
columns instead. Row counts:
`bus_ferry` 7,949, `bus` 7,782, `train` 374, `flight` 343, `ferry` 167.

### Identity and location (all files)

| Column | Type | Description |
|---|---|---|
| `Departure` | string | Origin terminal, station, port, or airport name as published by the source. |
| `Destination` | string | Destination terminal name. |
| `Departure Latitude`, `Departure Longitude` | float | Origin WGS84 coordinates. |
| `Destination Latitude`, `Destination Longitude` | float | Destination WGS84 coordinates. |
| `Departure Sub-district` / `Destination Sub-district` | string | RTSD ADM3 (tambon) name in English. |
| `Departure ADM3_PCODE` / `Destination ADM3_PCODE` | string | RTSD sub-district code, `TH######`. |
| `Departure District` / `Destination District` | string | RTSD ADM2 (amphoe) name in English. |
| `Departure ADM2_PCODE` / `Destination ADM2_PCODE` | string | RTSD district code, `TH####`. |
| `Departure Province` / `Destination Province` | string | RTSD ADM1 (changwat) name in English. |
| `Departure ADM1_PCODE` / `Destination ADM1_PCODE` | string | RTSD province code, `TH##`. Bangkok is `TH10`. |

### Service and volume

Ground files (`bus`, `ferry`, `train`, `bus_ferry`):

| Column | Type | Description |
|---|---|---|
| `Cheapest Price` | string | Lowest published fare for the route, formatted as printed on the source platform (e.g. `฿ 1,100`); blank where unavailable. |
| `Distance` | string | Route distance as reported by the operator (e.g. `859 km`); blank where unavailable. |
| `Est. Duration` | string | Estimated travel duration where published (roughly 20% of ground routes; blank or `-` otherwise). |
| `No. of Operators` | string | Count of distinct operators serving the route, formatted as printed on the source platform (e.g. `2 operators`); blank where none is listed. |
| `List of Operators` | string | Comma-delimited operator names. |
| `Total Trips` | float | Daily service count per route, verified across multiple weeks during collection. |

Flight file (`flight`) replaces the six columns above with:

| Column | Type | Description |
|---|---|---|
| `MovDeparture` | int | Annual aircraft movements on the route (2023). |
| `PassDeparture` | int | Annual passengers on the route (2023); the OD-matrix weight for aviation. |
| `FreightDeparture` | float | Annual freight tonnage on the route (2023). |

### Network centrality (all files)

Eigenvector and PageRank centralities for the origin and destination admin unit at
three levels. For the `bus_ferry` file, centralities are computed on the **combined
bus + ferry network**; for the per-mode files, on that mode's own network. Province
and district carry with- and without-Bangkok variants; sub-district carries only the
with-Bangkok value. Without-Bangkok cells are blank for admin units that exist only
by virtue of a Bangkok connection (Bangkok itself, and units that become isolated
when Bangkok is removed).

| Column pattern | Type | Description |
|---|---|---|
| `{Departure,Destination} Province EigenCentrality` | float | Weighted eigenvector centrality, full network. |
| `{Departure,Destination} Province PageRank` | float | PageRank (damping 0.85), full network. |
| `{Departure,Destination} Province EigenCentrality_noBKK` | float | Eigenvector centrality on the network with Bangkok removed. |
| `{Departure,Destination} Province PageRank_noBKK` | float | PageRank with Bangkok removed. |
| `{Departure,Destination} Sub-district EigenCentrality` | float | Sub-district eigenvector centrality, full network (no without-Bangkok variant). |
| `{Departure,Destination} Sub-district PageRank` | float | Sub-district PageRank, full network. |
| `{Departure,Destination} District EigenCentrality` | float | District eigenvector centrality, full network. |
| `{Departure,Destination} District PageRank` | float | District PageRank, full network. |
| `{Departure,Destination} District EigenCentrality_noBKK` | float | District eigenvector centrality, Bangkok removed. |
| `{Departure,Destination} District PageRank_noBKK` | float | District PageRank, Bangkok removed. |

## `od_matrices/od_{resolution}_{mode}.csv`

Square origin-destination matrices. `resolution` is one of `terminal`, `province`,
`district`, `subdistrict`; `mode` is one of `bus`, `ferry`, `train`, `flight`, or
`bus_ferry` (combined ground network). The first column holds the origin label; the
remaining columns are destinations. Cell `[i, j]` is the flow from `i` to `j`,
weighted by daily trip count for ground modes and annual passengers for aviation.

- **Labels**: terminal matrices are labelled by terminal name (join
  `terminal_reference.csv` on `(mode, location)` for coordinates and PCODEs);
  province, district, and sub-district matrices are labelled by RTSD PCODE
  (`TH##`, `TH####`, `TH######`), not by English name, so units that share a
  romanised name (for example the 18 sub-districts named "Nai Mueang") stay distinct.
- **Diagonal**: non-zero diagonal entries are genuine intra-zone intercity routes
  (for example mainland-to-island ferries within one province).
- **Combined**: `bus_ferry` matrices equal the sum of the bus and ferry networks; at
  province resolution the total is 188,063 daily trips (187,101 bus + 962 ferry).

## `terminal_reference.csv` (584 rows × 11 cols)

Lookup that makes the terminal-resolution OD matrices self-contained. One row per
terminal per mode; `(mode, location)` is unique.

| Column | Type | Description |
|---|---|---|
| `mode` | string | `bus`, `train`, `ferry`, or `flight`. Disambiguates names shared across modes (e.g. `Bangkok`). |
| `location` | string | Terminal name; matches the row/column labels in `od_terminal_{mode}.csv`. |
| `state` | string | Province as spelled by the source platform (may differ from the RTSD name). |
| `latitude`, `longitude` | float | WGS84 coordinates. |
| `ADM3_EN` | string | RTSD sub-district name in English. |
| `ADM3_PCODE` | string | RTSD sub-district code, `TH######`. |
| `ADM2_EN` | string | RTSD district name in English. |
| `ADM2_PCODE` | string | RTSD district code, `TH####`. |
| `ADM1_EN` | string | RTSD province name in English. |
| `ADM1_PCODE` | string | RTSD province code, `TH##`. |

## Conventions and known limitations

- **Coordinates**: WGS84 throughout.
- **Administrative codes**: RTSD PCODE conventions (`TH##` / `TH####` / `TH######`).
  Every ADM3 PCODE starts with its parent ADM2 PCODE, which starts with its parent
  ADM1 PCODE. Join on PCODE, not English name, to avoid romanisation collisions.
- **Supply, not demand**: trip counts are scheduled service supply, not observed
  ridership. Aviation figures are annual passenger flows; divide by 365 for a rough
  daily comparison, bearing in mind seasonality.
- **International routes excluded**: cross-border routes to Cambodia, Laos, Malaysia,
  and Vietnam present in the raw catalogues are excluded from all files here.
- **Temporal scope**: ground transport is an August–October 2024 snapshot; aviation is
  calendar year 2023.
