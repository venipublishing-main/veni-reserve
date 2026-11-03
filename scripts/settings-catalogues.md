# Tenant business settings reference codes

`python scripts/settings-catalogues.py <download-directory>` verifies the four
SHA-256 pins in the generator before producing both the Worker asset and the
marked SQL seed. Neither build nor runtime downloads data. Review updates as
a new migration, retaining existing values or explicitly mapping replacements.

| Input name | Upstream source | Selection |
| --- | --- | --- |
| tz.tar.gz | [IANA tzdata2026b](https://data.iana.org/time-zones/releases/tzdata2026b.tar.gz) | Zone definitions in geographical source files, plus explicit UTC. No Link or backzone aliases. Check the actual PostgreSQL timezone catalogue on save. |
| language.txt | [IANA Language Subtag Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry), File-Date 2026-09-17 | Nondeprecated individual/macrolanguages (2–3 letters) and registered geographic regions (2 letters). |
| currency.xml | [SIX ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), 2026-09-17 | Current non-fund entries intersected with CLDR legal tender as of 2026-11-03. |
| cldr.xml | [Unicode CLDR release 48 supplemental data](https://raw.githubusercontent.com/unicode-org/cldr/release-48/common/supplemental/supplementalData.xml) | Inclusive tender date ranges. |

The generated assets contain identifier facts only, without upstream descriptions,
XML or the ISO standard. [IANA's tzdb licence](https://data.iana.org/time-zones/tzdb/LICENSE)
describes the public-domain code/data and exceptions. The
[IANA registry publication terms](https://www.iana.org/help/licensing-terms)
cover registry data. [ISO permits free use of currency codes](https://www.iso.org/iso-4217-currency-codes.html).
SIX supplies the maintained code list. Unicode data attribution and permission
notice are in [UNICODE-LICENSE.txt](UNICODE-LICENSE.txt).
