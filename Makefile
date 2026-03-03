.DEFAULT_GOAL := test

VENV ?= .venv
PYTHON ?= python3
SAFE_MODE ?= 1

export SAFE_MODE

.PHONY: install setup test lint demo notebooks encompass-demo clean demo-cross-ratio demo-spectral-gap demo-angle-defect demo-invariants

install:
	$(PYTHON) -m venv $(VENV)
	. $(VENV)/bin/activate && pip install -U pip wheel
	. $(VENV)/bin/activate && pip install -U pytest pytest-cov numpy scipy hypothesis sympy matplotlib nbformat nbconvert ruff jupyter

setup: install

lint: install
	. $(VENV)/bin/activate && PYTHONPATH=$(PWD) ruff check qlm_lab/ tests/

# Run all tests with repo root on PYTHONPATH
test: install
	. $(VENV)/bin/activate && SAFE_MODE=$(SAFE_MODE) PYTHONPATH=$(PWD) pytest -q

notebooks: install
	. $(VENV)/bin/activate && PYTHONPATH=$(PWD) jupyter nbconvert --to notebook --execute --inplace notebooks/*.ipynb || true

# Optional: run the headline demo
demo: install
        . $(VENV)/bin/activate && SAFE_MODE=$(SAFE_MODE) PYTHONPATH=$(PWD) python scripts/demo_amundson_math_core.py
        . $(VENV)/bin/activate && PYTHONPATH=$(PWD) python scripts/demo_amundson_math_core.py

demo-cross-ratio: install
        mkdir -p data/demos
        . $(VENV)/bin/activate && PYTHONPATH=$(PWD) python tools/projective/cross_ratio.py 0,0 1,0 2,0 4,0 > data/demos/cross_ratio.txt

demo-spectral-gap: install
        mkdir -p data/demos
        printf "0 1\n1 2\n0 2\n" > data/demos/spectral_gap_edges.txt
        . $(VENV)/bin/activate && PYTHONPATH=$(PWD) python tools/dynamics/spectral_gap.py data/demos/spectral_gap_edges.txt > data/demos/spectral_gap.txt

demo-angle-defect: install
        mkdir -p data/demos
        cat <<'OBJ' > data/demos/tetrahedron.obj
v 0 0 0
v 1 0 0
v 0 1 0
v 0 0 1
f 1 2 3
f 1 4 2
f 2 4 3
f 3 4 1
OBJ
        . $(VENV)/bin/activate && PYTHONPATH=$(PWD) python tools/geometry/angle_defect.py data/demos/tetrahedron.obj --output data/demos/angle_defects.csv > data/demos/angle_defect_summary.txt

demo-invariants: demo-cross-ratio demo-spectral-gap demo-angle-defect

encompass-demo: install
        . $(VENV)/bin/activate && PYTHONPATH=$(PWD) python scripts/encompass_demo.py --prompt "Who are we?" --pretty --output ui/lucidia_viewer/packets.json

clean:
        rm -rf $(VENV) .pytest_cache __pycache__ */__pycache__
