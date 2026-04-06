-- CreateIndex
CREATE INDEX "Cita_fecha_estado_idx" ON "Cita"("fecha", "estado");

-- CreateIndex
CREATE INDEX "Cita_clienteTelefono_estado_idx" ON "Cita"("clienteTelefono", "estado");

-- CreateIndex
CREATE INDEX "Cita_fecha_horario_idx" ON "Cita"("fecha", "horario");
