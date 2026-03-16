import { DatasetRepository } from "../core/dataset-repository";
import { Dataset } from "../types";
import { fetchLatestDataset } from "./reference-source";

export class ReferenceUpdater {
  constructor(private readonly repository = new DatasetRepository()) {}

  async update(): Promise<Dataset> {
    const dataset = await fetchLatestDataset();
    await this.repository.save(dataset);
    return dataset;
  }
}
