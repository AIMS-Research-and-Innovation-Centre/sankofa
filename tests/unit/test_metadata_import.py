import io
import csv
from sankofa.metadata_import import parse_rows

HEADER = "id,title,author,advisor,date_issued,abstract,subject,msc,type,language,doi,licence,centre,programme,cohort\n"


def rows(text):
    return parse_rows(csv.DictReader(io.StringIO(HEADER + text)))


def test_template_row_with_multi_values():
    (meta,), errors = rows('t1,On SIR,"Owusu, Ama||Diop, Awa",Mensah Kofi,2019-06-30,Abstract.,malaria||sir,92D30,Master\'s thesis,en,,https://creativecommons.org/licenses/by/4.0/,AIMS Ghana,MSc,2019\n')
    assert not errors
    assert [a.display for a in meta.authors] == ["Owusu, Ama", "Diop, Awa"]
    assert meta.supervisors[0].display == "Kofi, Mensah"  # surname last without a comma
    assert meta.keywords == ["malaria", "sir"] and meta.licence == "CC-BY-4.0" and meta.centre == "ghana"


def test_existing_doi_and_derived_id():
    (meta,), _ = rows(',Graph Neural Networks for Molecules,Thabo Nkosi,,2021,,,,PhD thesis,en,10.5555/x,,south africa,,\n')
    assert meta.id == "aims-2021-south-africa-nkosi-graph-neural-networks-for"
    assert (meta.doi, meta.doi_state, meta.programme) == ("10.5555/x", "findable", "PhD")


def test_bad_rows_are_reported_not_imported():
    records, errors = rows('t1,,Owusu Ama,,2019,,,,,en,,,ghana,,\nt2,Fine,Diop Awa,,2020,,,,,en,,MIT,ghana,,\nt3,Ok,Ndiaye Moussa,,2024,,,,,en,,,mars,,\n')
    assert records == [] and len(errors) == 3
    assert errors[0].startswith("row 2: title") and "licence" in errors[1] and "Centre" in errors[2]
