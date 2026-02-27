from __future__ import annotations

import ast
import importlib.util
import sys
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, Optional, Type

try:  # Optional dependency used only at runtime
try:  # pragma: no cover - optional dependency
try:  # Optional dependency
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover - numpy may be absent
    np = None  # type: ignore

try:  # Condor itself may not be installed in all environments
    import condor  # type: ignore  # noqa: F401
except Exception:  # pragma: no cover - Condor may be absent
try:  # pragma: no cover - optional dependency
    import condor  # type: ignore
except Exception:  # pragma: no cover - condor may be absent in CI
    condor = None  # type: ignore
try:  # pragma: no cover - optional dependency in CI
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover
    np = None  # type: ignore

condor = None  # placeholder for the real library at runtime

CONDOR_PACKAGE_PREFIX = "condor"

ALLOWED_IMPORTS = {"condor", "math", "numpy", "dataclasses"}
FORBIDDEN_NAMES = {
    "open",
    "os",
    "sys",
    "subprocess",
    "socket",
    "sockets",
    "eval",
    "exec",
    "__import__",
}


def _to_primitive(obj: Any) -> Any:
    """Recursively convert dataclasses and arrays into Python primitives."""

def _dataclass_to_dict(obj: Any) -> Any:
    """Recursively convert dataclasses and numpy arrays into primitives.

    This helper ensures that results are JSON serialisable. ``numpy`` arrays
    are transformed into Python lists.
    """
    """Recursively convert dataclasses and ``numpy`` arrays into primitives."""

    """Recursively convert dataclasses and ``numpy`` arrays into primitives."""
    """
    Recursively convert dataclasses and ``numpy`` arrays into primitives suitable for JSON serialization.

    This helper ensures that results are JSON serialisable. ``numpy`` arrays are transformed into Python lists.
    """
    if is_dataclass(obj):
        return {k: _to_primitive(v) for k, v in asdict(obj).items()}
    if np is not None and isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _to_primitive(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_to_primitive(v) for v in obj]
    return obj


def validate_model_source(py_text: str) -> None:
    """Validate a user supplied model source string.

    The validator performs a conservative static analysis using :mod:`ast`.
    Only a small allow-list of imports is permitted and several dangerous
    names are rejected.  The intent is to catch obvious misuse before
    executing code in a sandbox.
    The validator performs a conservative static analysis using ``ast``. Only
    a small allow-list of imports is permitted and several dangerous names are
    rejected. The intent is to catch obvious misuse before executing code in a
    sandbox.
    names are rejected. The intent is to catch obvious misuse before executing
    code in a sandbox.
    """
FORBIDDEN_NAMES = {"open", "os", "sys", "subprocess", "socket", "eval", "exec"}


def _normalise(value: Any) -> Any:
    if is_dataclass(value):
        return {k: _normalise(v) for k, v in asdict(value).items()}
    if np is not None and isinstance(value, np.ndarray):  # pragma: no cover - optional
        return value.tolist()
    if isinstance(value, dict):
        return {k: _normalise(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_normalise(v) for v in value]
    return value


def validate_model_source(py_text: str) -> None:
    """Perform a tiny security audit over ``py_text``."""

    """Validate a user supplied model source string."""
    """
    Validate user-supplied model source code using conservative static analysis.

    The validator walks the ``ast`` for the provided source, restricts imports to a
    small allow-list, and rejects several dangerous names and dunder attribute
    access. Any disallowed construct raises ``ValueError`` to prevent unsafe
    execution when loading user models.
    """
    tree = ast.parse(py_text)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in ALLOWED_IMPORTS:
                    raise ValueError(f"Disallowed import: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
                raise ValueError(f"from '{node.module}' import is not allowed")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in FORBIDDEN_NAMES:
                raise ValueError(f"Forbidden call: {node.func.id}")
        elif isinstance(node, ast.Name):
            if node.id in FORBIDDEN_NAMES:
                raise ValueError(f"use of '{node.id}' is forbidden")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                raise ValueError("dunder attribute access is forbidden")
                raise ValueError(f"usage of '{node.id}' is forbidden")
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ValueError("Dunder attribute access is not allowed")

    for token in FORBIDDEN_NAMES:
        if token in py_text:
            raise ValueError(f"forbidden token found: {token}")

            root = (node.module or "").split(".")[0]
            if root not in ALLOWED_IMPORTS:
                raise ValueError(f"Disallowed import: {node.module}")
        elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise ValueError(f"Forbidden name: {node.id}")

    for forbidden in FORBIDDEN_NAMES:
        if forbidden in py_text:
            raise ValueError(f"Forbidden token found: {forbidden}")


def _load_module(py_text: str, module_name: str) -> ModuleType:
def _load_module_from_source(source: str, module_name: str) -> ModuleType:
    """Load a module from source text in an isolated temporary directory."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{module_name}.py"
        path.write_text(py_text, encoding="utf-8")
        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:  # pragma: no cover - defensive
            raise ImportError("Unable to create import spec")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module


def load_model_from_source(py_text: str, class_name: str) -> Type[Any]:
    """Validate and load a model class from source code."""

    validate_model_source(py_text)
    module = _load_module_from_source(py_text, "user_model")
    return getattr(module, class_name)

    """Validate ``py_text`` and return ``class_name`` from it."""
    """
    Validate and load a model class from source code.

    Parameters
    ----------
    py_text : str
        The Python source code as a string, expected to define a model class.
    class_name : str
        The name of the class to load from the provided source code.

    Returns
    -------
    Type[Any]
        The loaded model class object.

    Raises
    ------
    ValueError
        If the source code contains forbidden imports or names.
    ImportError
        If the module cannot be loaded from the source code.
    AttributeError
        If the specified class is not found in the loaded module.

    This function first validates the provided source code for safety,
    then loads it as a module in an isolated temporary directory,
    and finally returns the specified class object from the module.
    """
    validate_model_source(py_text)
    module = _load_module_from_source(py_text, "user_model")
    return getattr(module, class_name)

    validate_model_source(py_text)
    module = _load_module(py_text, "condor_user_model")
    return getattr(module, class_name)

def solve_algebraic(model_cls: Type[Any], **params: Any) -> Any:
    """Instantiate ``model_cls`` and call its ``solve`` method.

    The returned object is converted to basic Python types so that it is
    easy to serialise to JSON.  When the real Condor library is absent,
    models that originate from the ``condor`` package cannot be
    instantiated and a :class:`RuntimeError` is raised.  User supplied
    models remain supported even without Condor installed.
def solve_algebraic(model_cls: Type[Any], **params: Any) -> Dict[str, Any]:
    """Instantiate ``model_cls`` and call its ``solve`` method.

    The returned object is converted to basic Python types so that it is
    easy to serialise to JSON.
    The helper instantiates ``model_cls`` with ``params`` and calls its
    ``solve`` method. Results are converted into a JSON-friendly dictionary.
    This function does not require the Condor package to be installed; it only
    relies on the behaviour of the provided model class.
    """
def solve_algebraic(model_cls: Type[Any], **params: Any) -> Dict[str, Any]:
    """Solve a Condor ``AlgebraicSystem`` model."""

    if condor is None and model_cls.__module__.split(".")[0] == "condor":
    """Solve a Condor ``AlgebraicSystem`` model."""
    """
    Instantiates the given Condor ``AlgebraicSystem`` model class with the provided parameters,
    calls its ``solve`` method, and returns the results as a JSON-friendly dictionary.

    Parameters
    ----------
    model_cls : Type[Any]
        The Condor model class to instantiate (should be a subclass of ``AlgebraicSystem``).
    **params : Any
        Keyword arguments to pass to the model class constructor.

    Returns
    -------
    Dict[str, Any]
        The solution returned by ``model.solve()``, converted to a JSON-serializable dictionary.
    """
    if condor is None:  # pragma: no cover - runtime guard
        raise RuntimeError("Condor is not installed")

    if condor is None and model_cls.__module__.split(".")[0] == CONDOR_PACKAGE_PREFIX:
        raise RuntimeError(
            "Condor is not installed. Install it with: pip install condor\n"
            "See https://github.com/nasa/condor for documentation."
        )

    model = model_cls(**params)
    result = model.solve() if hasattr(model, "solve") else model
    return _to_primitive(result)
    model = model_cls(**params)
    result = model.solve() if hasattr(model, "solve") else model
    return _dataclass_to_dict(result)
    model = model_cls(**params)
    result = model.solve() if hasattr(model, "solve") else model
    return _normalise(result)
    model = model_cls(**params)
    solution = model.solve() if hasattr(model, "solve") else model
    return _dataclass_to_dict(solution)


def simulate_ode(
    model_cls: Type[Any],
    t_final: float,
    initial: Any,
    params: Optional[Dict[str, Any]] = None,
    events: Any = None,
    modes: Any = None,
) -> Any:
    """Simulate an ODE system if the model exposes a ``simulate`` method."""
    initial: Dict[str, Any],
    params: Dict[str, Any] | None = None,
    events: Any | None = None,
    modes: Any | None = None,
) -> Dict[str, Any]:
    """Simulate an ``ODESystem`` until ``t_final``."""
    """Simulate an ``ODESystem`` until ``t_final`` if the model supports it."""

    model = model_cls(**(params or {}))
    if hasattr(model, "simulate"):
        result = model.simulate(t_final, initial, events=events, modes=modes)
    else:  # pragma: no cover - dummy fallback for tests
        result = {}
    return _to_primitive(result)
    else:  # pragma: no cover - dummy fallback
        result = {}
    return _dataclass_to_dict(result)
    params: Dict[str, Any],
    *,
    events: Any | None = None,
    modes: Any | None = None,
) -> Dict[str, Any]:

    """
    Simulate an ``ODESystem`` until ``t_final``.
