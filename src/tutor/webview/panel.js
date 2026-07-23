(function () {
  const vscode = acquireVsCodeApi();

  const chapterTitleEl = document.getElementById("chapterTitle");
  const stepTitleEl = document.getElementById("stepTitle");
  const stepCounterEl = document.getElementById("stepCounter");
  const progressBarEl = document.getElementById("progressBar");
  const stepDropdownEl = document.getElementById("stepDropdown");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnClose = document.getElementById("btnClose");
  const instructionsEl = document.getElementById("instructions");
  const taskListEl = document.getElementById("taskList");

  let currentTasks = [];

  function renderTasks(tasks) {
    currentTasks = tasks;
    taskListEl.innerHTML = "";

    tasks.forEach((task, idx) => {
      // Sequential task locking: task N is disabled unless task N-1 is done
      const isDisabled = idx > 0 && !tasks[idx - 1].done;

      const li = document.createElement("li");
      li.className = `task-item ${task.done ? "completed" : ""} ${isDisabled ? "disabled" : ""}`;
      li.dataset.index = task.index;

      const checkbox = document.createElement("div");
      checkbox.className = "task-checkbox";

      const label = document.createElement("span");
      label.className = "task-label";
      label.textContent = task.label;

      li.appendChild(checkbox);
      li.appendChild(label);

      if (!isDisabled) {
        li.addEventListener("click", () => {
          vscode.postMessage({
            command: "toggleTask",
            taskIndex: task.index,
          });
        });
      }

      taskListEl.appendChild(li);
    });

    updateCompletionState();
  }

  function updateCompletionState() {
    const allDone = currentTasks.length > 0 && currentTasks.every((t) => t.done);
    if (allDone) {
      btnNext.classList.add("primary");
    } else {
      btnNext.classList.remove("primary");
    }
  }

  btnPrev.addEventListener("click", () => {
    vscode.postMessage({ command: "prevStep" });
  });

  btnNext.addEventListener("click", () => {
    vscode.postMessage({ command: "nextStep" });
  });

  btnClose?.addEventListener("click", () => {
    vscode.postMessage({ command: "closeTutor" });
  });

  stepDropdownEl.addEventListener("change", (e) => {
    const targetIndex = parseInt(e.target.value, 10);
    if (!isNaN(targetIndex)) {
      vscode.postMessage({ command: "jumpToStep", stepIndex: targetIndex });
    }
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "loadStep": {
        const {
          chapterTitle,
          stepTitle,
          globalStepIndex,
          totalSteps,
          instructionsHtml,
          tasks,
          dropdownOptions,
        } = message.payload;

        chapterTitleEl.textContent = chapterTitle;
        stepTitleEl.textContent = stepTitle;
        stepCounterEl.textContent = `Step ${globalStepIndex + 1} / ${totalSteps}`;

        const progressPercent = Math.round(((globalStepIndex + 1) / totalSteps) * 100);
        progressBarEl.style.width = `${progressPercent}%`;

        // Update dropdown
        stepDropdownEl.innerHTML = "";
        dropdownOptions.forEach((opt) => {
          const optionEl = document.createElement("option");
          optionEl.value = opt.globalIndex;
          optionEl.textContent = `${opt.chapterTitle} > ${opt.stepTitle}`;
          if (opt.globalIndex === globalStepIndex) {
            optionEl.selected = true;
          }
          stepDropdownEl.appendChild(optionEl);
        });

        btnPrev.disabled = globalStepIndex === 0;
        btnNext.disabled = globalStepIndex === totalSteps - 1;

        instructionsEl.innerHTML = instructionsHtml;
        renderTasks(tasks);
        break;
      }
      case "updateTasks": {
        const { tasks } = message.payload;
        renderTasks(tasks);
        break;
      }
      case "stepCompleted": {
        btnNext.classList.add("primary");
        break;
      }
    }
  });
})();
