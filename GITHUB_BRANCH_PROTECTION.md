# 🛡️ Configurar Protecciones de Branch en GitHub

## ⚠️ IMPORTANTE: Estas configuraciones se hacen en GitHub UI

Las protecciones de branch NO se pueden configurar desde código. Debes hacerlo manualmente en GitHub.

---

## 📋 Paso a Paso

### 1. Ve a tu Repositorio en GitHub

```
https://github.com/TU_USUARIO/vibe-template
```

### 2. Click en "Settings"

- En la barra superior del repositorio
- Necesitas permisos de administrador

### 3. Ve a "Branches" en el menú lateral

```
Settings → Code and automation → Branches
```

### 4. Click en "Add branch protection rule"

O si ya existe una regla para `main`, edítala.

---

## ⚙️ Configuración Recomendada

### Branch name pattern
```
main
```

### ✅ Protecciones a Habilitar

#### 1. Require a pull request before merging
```
☑️ Require a pull request before merging
```

Dentro de esta opción, configura:

```
☑️ Require approvals
   Número requerido: 1

☑️ Dismiss stale pull request approvals when new commits are pushed
   (Invalidar aprobaciones antiguas cuando se hacen nuevos commits)

☑️ Require review from Code Owners
   (Requerir review de los dueños del código)
```

#### 2. Require status checks to pass before merging
```
☑️ Require status checks to pass before merging

☑️ Require branches to be up to date before merging
   (La branch debe estar actualizada con main antes de mergear)
```

#### 3. Require conversation resolution before merging
```
☑️ Require conversation resolution before merging
   (Todos los comentarios deben estar resueltos)
```

#### 4. Do not allow bypassing the above settings
```
☑️ Do not allow bypassing the above settings
   (Ni siquiera administradores pueden saltarse estas reglas)
```

**⚠️ IMPORTANTE**: Habilita esta opción solo si tienes otro administrador que pueda revisar tus PRs.

---

## 🎯 Resultado

Una vez configurado:

### ✅ Lo que SÍ podrás hacer:
- Crear branches desde `main`
- Push a branches de feature
- Crear Pull Requests
- Revisar PRs de otros

### ❌ Lo que NO podrás hacer:
- `git push origin main` (bloqueado)
- Mergear sin review aprobado
- Mergear con checks fallando
- Mergear con comentarios sin resolver

---

## 📸 Visual de la Configuración

```
┌─────────────────────────────────────────────────────┐
│ Branch protection rule                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Branch name pattern: main                          │
│                                                     │
│ ☑ Require a pull request before merging           │
│   └─ ☑ Require approvals: 1                       │
│   └─ ☑ Dismiss stale PR approvals                 │
│   └─ ☑ Require review from Code Owners            │
│                                                     │
│ ☑ Require status checks to pass                   │
│   └─ ☑ Require branches to be up to date          │
│                                                     │
│ ☑ Require conversation resolution                 │
│                                                     │
│ ☑ Do not allow bypassing (admin override)         │
│                                                     │
│           [Create] [Cancel]                        │
└─────────────────────────────────────────────────────┘
```

---

## 🧪 Cómo Probar que Funciona

### Test 1: Intentar push directo a main (debe fallar)

```bash
git checkout main
echo "test" >> test.txt
git add test.txt
git commit -m "test"
git push origin main
```

**Resultado esperado:**
```
! [remote rejected] main -> main (protected branch hook declined)
error: failed to push some refs
```

✅ Si ves este error, ¡las protecciones están funcionando!

### Test 2: Crear PR sin review (debe bloquearse el merge)

```bash
git checkout -b test/protection
echo "test" >> test.txt
git add test.txt
git commit -m "test"
git push origin test/protection
```

Luego en GitHub:
1. Crea un PR de `test/protection` → `main`
2. Intenta hacer merge

**Resultado esperado:**
- Botón de "Merge" estará deshabilitado
- Mensaje: "Review required — At least 1 approving review is required"

✅ Si el botón está deshabilitado, ¡funciona correctamente!

---

## 👥 Configurar Otro Reviewer

Para que el sistema de reviews funcione, necesitas:

### Opción 1: Agregar colaborador al repo
1. Settings → Collaborators
2. Add people
3. Busca por username o email
4. Invitar con rol "Write" o superior

### Opción 2: Si trabajas solo
- Deshabilita temporalmente "Do not allow bypassing"
- O usa GitHub Actions como "reviewer" automático

---

## 🔄 Workflow Después de Configurar

```bash
# 1. Crear branch
git checkout main
git pull
git checkout -b feat/nueva-feature

# 2. Hacer cambios y commit
git add .
git commit -m "feat: descripción"
git push origin feat/nueva-feature

# 3. Crear PR en GitHub UI

# 4. Esperar review y aprobación

# 5. Merge desde GitHub UI (no desde CLI)
```

---

## ⚡ Quick Reference

| Acción | Permitido | Bloqueado |
|--------|-----------|-----------|
| Push a feature branch | ✅ | |
| Push directo a main | | ❌ |
| Crear PR | ✅ | |
| Mergear PR sin review | | ❌ |
| Mergear PR con 1+ review | ✅ | |
| Mergear con checks fallando | | ❌ |
| Mergear con comentarios sin resolver | | ❌ |

---

## 🆘 Troubleshooting

### "No puedo editar branch protections"
- Necesitas ser administrador del repositorio
- Si es un fork, necesitas configurarlo en el repo original

### "Me bloqueó a mí mismo"
- Invita a otro colaborador para que revise tus PRs
- O temporalmente deshabilita "Do not allow bypassing"

### "Los checks no aparecen"
- Asegúrate de tener GitHub Actions configuradas
- O deshabilita "Require status checks" temporalmente

---

## 📚 Referencias

- [GitHub Docs: Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Docs: CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [GitHub Docs: Required Reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews)

---

**✅ Una vez configurado, tu código estará protegido y requerirá reviews obligatorios!**
